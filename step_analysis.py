import argparse
import lxml.etree as ET
from datetime import datetime, date
from dateutil import parser as dtparser
from collections import defaultdict
from typing import Iterable, Tuple, List, Dict
import pandas as pd
import matplotlib.pyplot as plt
from tqdm import tqdm

# Constants
STEP_TYPE = "HKQuantityTypeIdentifierStepCount"


def parse_step_records(export_file: str) -> Iterable[Tuple[datetime, datetime, int]]:
    """Lazy generator yielding (start_datetime, end_datetime, step_count) tuples.

    Parameters
    ----------
    export_file : str
        Path to Apple Health `export.xml` file.
    """
    context = ET.iterparse(export_file, events=("end",))
    for _event, elem in context:
        if elem.tag == "Record" and elem.attrib.get("type") == STEP_TYPE:
            try:
                start_dt = dtparser.parse(elem.attrib["startDate"])
                end_dt = dtparser.parse(elem.attrib["endDate"])
                value = int(float(elem.attrib["value"]))
                yield start_dt, end_dt, value
            except (KeyError, ValueError):
                # skip malformed records
                pass
        # Ensure we free memory
        elem.clear()
        while elem.getprevious() is not None:
            del elem.getparent()[0]


def aggregate_daily_steps(records: Iterable[Tuple[datetime, datetime, int]]) -> pd.DataFrame:
    """Aggregate step records into a DataFrame indexed by date.

    Returns
    -------
    pd.DataFrame
        Columns: ["steps"]. Index: datetime.date
    """
    daily_totals: Dict[date, int] = defaultdict(int)
    for start_dt, _end_dt, value in tqdm(records, desc="Parsing records"):
        # Assign steps to the date of the start time (Apple Health records do not cross days)
        daily_totals[start_dt.date()] += value
    df = pd.DataFrame({"date": list(daily_totals.keys()), "steps": list(daily_totals.values())})
    df = df.sort_values("date").set_index("date")
    return df


def analyze_by_dow(df: pd.DataFrame, start: date | None, end: date | None) -> pd.Series:
    """Compute average steps per day of week in a date range.

    Parameters
    ----------
    df : pd.DataFrame
        DataFrame returned by `aggregate_daily_steps`.
    start : date | None
        Inclusive start of period to consider.
    end : date | None
        Inclusive end of period to consider.

    Returns
    -------
    pd.Series
        Index: day of week name (Monday, Tuesday, ...), values: average steps.
    """
    df_period = df.copy()
    if start:
        df_period = df_period[df_period.index >= start]
    if end:
        df_period = df_period[df_period.index <= end]
    df_period = df_period.assign(dow=df_period.index.map(lambda d: d.strftime("%A")))
    return df_period.groupby("dow")["steps"].mean().sort_values(ascending=False)


def plot_dow_series(series: pd.Series, title: str):
    plt.figure(figsize=(10, 6))
    series.reindex(
        ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    ).plot(kind="bar", color="skyblue")
    plt.ylabel("Average steps")
    plt.title(title)
    plt.tight_layout()
    plt.show()


# ---------- Wrapped / Highlights ----------
STEP_GOAL = 10000  # default goal steps per day
STREAK_THRESHOLD = 8000  # steps considered a "good" day for streaks


def _longest_streak(series: pd.Series, threshold: int) -> Tuple[int, date, date]:
    """Return (length, start_date, end_date) of longest streak with value >= threshold."""
    max_len = cur_len = 0
    streak_start = streak_end = None
    tmp_start = None
    for d, val in series.items():
        if val >= threshold:
            if cur_len == 0:
                tmp_start = d
            cur_len += 1
            if cur_len > max_len:
                max_len = cur_len
                streak_start = tmp_start
                streak_end = d
        else:
            cur_len = 0
    return max_len, streak_start, streak_end


def generate_wrapped_facts(df: pd.DataFrame, start: date | None, end: date | None) -> List[str]:
    """Generate 7 'Wrapped' style highlight lines."""
    dfp = df.copy()
    if start:
        dfp = dfp[dfp.index >= start]
    if end:
        dfp = dfp[dfp.index <= end]
    if dfp.empty:
        return ["No data for selected period."]

    # Ensure index is a pandas DatetimeIndex for period operations
    dt_index = pd.to_datetime(dfp.index)

    total_steps = int(dfp["steps"].sum())
    days = dfp.shape[0]
    avg_steps = int(total_steps / days)

    # 1. Total steps and equivalent miles (approx 2,000 steps per mile)
    miles = total_steps / 2000.0
    fact1 = f"🦶 You took {total_steps:,} steps (~{miles:.1f} miles)!"

    # 2. Average steps per day
    fact2 = f"📈 Averaged {avg_steps:,} steps per day over {days} days."

    # 3. Best day
    best_day = dfp["steps"].idxmax()
    best_val = int(dfp.loc[best_day, "steps"])
    fact3 = f"🏆 Best day: {best_day:%Y-%m-%d} with {best_val:,} steps."

    # 4. Weekday champion
    dow_avg = (
        dfp.assign(dow=dfp.index.map(lambda d: d.strftime("%A")))
        .groupby("dow")["steps"]
        .mean()
    )
    top_dow = dow_avg.idxmax()
    fact4 = f"📅 You walk most on {top_dow}s (avg {int(dow_avg.max()):,} steps)."

    # 5. Longest >= STREAK_THRESHOLD streak
    streak_len, streak_start, streak_end = _longest_streak(dfp["steps"], STREAK_THRESHOLD)
    if streak_len > 0:
        fact5 = (
            f"🔥 Longest {STREAK_THRESHOLD}+ streak: {streak_len} days "
            f"({streak_start:%Y-%m-%d} → {streak_end:%Y-%m-%d})."
        )
    else:
        fact5 = "🔥 No streaks yet above threshold—new goals await!"

    # 6. 10k goal achievement rate
    pct_goal = (dfp[dfp["steps"] >= STEP_GOAL].shape[0] / days) * 100.0
    fact6 = f"🎯 Hit {STEP_GOAL:,}+ steps on {pct_goal:.1f}% of days."

    # 7. Top month
    month_avg = dfp.copy()
    month_avg["month"] = dt_index.to_period("M")
    month_means = month_avg.groupby("month")["steps"].mean()
    top_month_period = month_means.idxmax()
    top_month_val = int(month_means.max())
    month_str = top_month_period.start_time.strftime("%B %Y")
    fact7 = f"🌙 Peak month: {month_str} (avg {top_month_val:,}/day)."

    return [fact1, fact2, fact3, fact4, fact5, fact6, fact7]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze Apple Health step counts.")

    parser.add_argument("export_file", help="Path to Apple Health export.xml file")

    subparsers = parser.add_subparsers(dest="command", required=True)

    # Sub-command: dow
    dow_parser = subparsers.add_parser(
        "dow",
        help="Compute average steps per day-of-week within a date range",
    )
    dow_parser.add_argument(
        "--start",
        type=lambda s: dtparser.parse(s).date(),
        help="Start date (inclusive) in YYYY-MM-DD format",
    )
    dow_parser.add_argument(
        "--end",
        type=lambda s: dtparser.parse(s).date(),
        help="End date (inclusive) in YYYY-MM-DD format",
    )
    dow_parser.add_argument(
        "--no-plot",
        action="store_true",
        help="Do not display bar chart; just print results",
    )

    # Sub-command: wrapped
    wrap_parser = subparsers.add_parser(
        "wrapped",
        help="Print 7 Spotify-Wrapped style step highlights",
    )
    wrap_parser.add_argument(
        "--start",
        type=lambda s: dtparser.parse(s).date(),
        help="Start date (inclusive) in YYYY-MM-DD format",
    )
    wrap_parser.add_argument(
        "--end",
        type=lambda s: dtparser.parse(s).date(),
        help="End date (inclusive) in YYYY-MM-DD format",
    )

    return parser.parse_args()


def main():
    args = parse_args()

    print("Parsing step records... this may take a while for large exports.")
    records = parse_step_records(args.export_file)
    df = aggregate_daily_steps(records)

    if args.command == "dow":
        series = analyze_by_dow(df, args.start, args.end)
        print("Average steps per day of week:")
        print(series.to_string())
        if not args.no_plot:
            title = "Average steps per day of week"
            if args.start or args.end:
                title += " (" + (
                    f"{args.start.isoformat() if args.start else '...'} to {args.end.isoformat() if args.end else '...'}"
                ) + ")"
            plot_dow_series(series, title)
    elif args.command == "wrapped":
        facts = generate_wrapped_facts(df, args.start, args.end)
        print("\n".join(facts))
    else:
        raise ValueError(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main() 