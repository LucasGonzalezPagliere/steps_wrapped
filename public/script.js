// script.js

// Constants
const STEP_TYPE = "HKQuantityTypeIdentifierStepCount";
const STEP_GOAL = 10000;
const STREAK_THRESHOLD = 6500;
const CALORIES_PER_1000_STEPS = 40;
const CALORIES_PER_PIZZA_SLICE = 250;
const MILES_PER_STEP = 0.0005;
const MILES_PER_CAR_TRIP = 2.3;
const MILES_PER_MARATHON = 26.2;

// Famous walking distances (in miles)
const DISTANCE_FACTS = [
  { threshold: 50, fact: "That's like walking from Manhattan to The Bronx and back!" },
  { threshold: 100, fact: "That's like walking from Boston to Providence!" },
  { threshold: 200, fact: "You've walked the distance from New York City to Boston!" },
  { threshold: 300, fact: "That's like walking from Los Angeles to Las Vegas!" },
  { threshold: 400, fact: "You've walked the distance from Chicago to Detroit!" },
  { threshold: 500, fact: "That's like walking from San Francisco to Los Angeles!" },
  { threshold: 750, fact: "You've walked from Chicago to Nashville!" },
  { threshold: 1000, fact: "That's like walking from New York City to Chicago!" },
  { threshold: 1500, fact: "You've walked from Seattle to Los Angeles!" },
  { threshold: 2000, fact: "That's like walking from New York to Miami!" },
  { threshold: 2500, fact: "You've walked from Los Angeles to Chicago!" },
  { threshold: 3000, fact: "That's like walking from Seattle to Miami!" },
  { threshold: Infinity, fact: "You've walked across America... and then some!" }
];

const fileInput = document.getElementById("fileInput");
const landing = document.getElementById("landing");
const slidesContainer = document.getElementById("slides");

// Update file input to accept ZIP files
fileInput.accept = ".xml,.zip";

// Color palette for slides
const COLORS = [
  "#1DB954", // spotify green
  "#ef476f",
  "#ffd166",
  "#06d6a0",
  "#118ab2",
  "#073b4c",
  "#ff9f1c",
  "#8e44ad",
];

// Helper function to normalize date to YYYY-MM-DD in local timezone
function normalizeDate(dateStr) {
  // Parse date string like "2024-10-01 19:24:04 -0700"
  const [datePart] = dateStr.split(' ');
  return datePart; // Already in YYYY-MM-DD format
}

// Helper function to compare dates ignoring time
function isSameOrAfterDate(date1, date2) {
  return normalizeDate(date1) >= normalizeDate(date2);
}

// Helper function to compare dates ignoring time
function isBeforeOrEqualDate(date1, date2) {
  return normalizeDate(date1) <= normalizeDate(date2);
}

// Helper function to get rolling 12 months window
function getRollingYearWindow() {
  const now = new Date();
  // Set end date to today
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Go back exactly 365 days
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 365);
  
  return {
    start: startDate,
    end: endDate,
    startStr: normalizeDate(startDate.toISOString()),
    endStr: normalizeDate(endDate.toISOString())
  };
}

// Helper to format hour range
function formatHourRange(hour) {
  const start = hour % 12 || 12;
  const end = (hour + 1) % 12 || 12;
  const period = hour < 12 ? 'AM' : 'PM';
  return `${start}-${end} ${period}`;
}

// Calculate activity level badge
function getActivityBadge(avgSteps) {
  if (avgSteps >= 10000) return "Golden Walker 🥇";
  if (avgSteps >= 6000) return "Silver Strider 🥈";
  if (avgSteps >= 4000) return "Bronze Stepper 🥉";
  return "Getting Started 🌱";
}

// Calculate consistency score (0-100) with safe defaults
function calculateConsistencyScore(dailySteps) {
  try {
    const values = Object.values(dailySteps);
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 0;
    
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = (stdDev / mean) * 100;
    
    const score = Math.max(0, Math.min(100, 100 - coefficientOfVariation));
    return Math.round(score);
  } catch (error) {
    console.error('Error calculating consistency score:', error);
    return 0;
  }
}

// Find best month with safe defaults
function findBestMonth(dailySteps) {
  try {
    const monthlySteps = {};
    const monthlyDays = {};
    
    // Get the valid date window
    const dateWindow = getRollingYearWindow();
    console.log('Finding best month in window:', dateWindow);
    
    Object.entries(dailySteps).forEach(([date, steps]) => {
      // Group by month (YYYY-MM)
      const monthKey = date.slice(0, 7);
      monthlySteps[monthKey] = (monthlySteps[monthKey] || 0) + steps;
      monthlyDays[monthKey] = (monthlyDays[monthKey] || 0) + 1;
    });
    
    if (Object.keys(monthlySteps).length === 0) return null;
    
    // Calculate average steps per day for each month
    const monthlyAverages = Object.entries(monthlySteps)
      // Only include months with at least 15 days of data
      .filter(([_, __, days = monthlyDays[_]]) => days >= 15)
      .map(([month, steps]) => ({
        month,
        days: monthlyDays[month],
        total: steps,
        average: steps / monthlyDays[month]
      }));
    
    console.log('Monthly stats:', monthlyAverages.map(m => ({
      month: m.month,
      days: m.days,
      average: Math.round(m.average),
      total: m.total
    })));
    
    if (monthlyAverages.length === 0) return null;
    
    const bestMonth = monthlyAverages.reduce((a, b) => 
      b.average > a.average ? b : a
    , monthlyAverages[0]);
    
    const date = new Date(bestMonth.month + '-01');
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch (error) {
    console.error('Error finding best month:', error);
    return null;
  }
}

// Find the most active hour
function findPowerHour(records) {
  // Group steps by hour and date to get daily patterns
  const hourlyData = {};
  
  records.forEach(record => {
    const date = new Date(record.getAttribute("startDate"));
    const hour = date.getHours();
    const dateKey = normalizeDate(date);
    const steps = Number(record.getAttribute("value"));
    
    if (!hourlyData[hour]) {
      hourlyData[hour] = { totalSteps: 0, days: new Set() };
    }
    
    hourlyData[hour].totalSteps += steps;
    hourlyData[hour].days.add(dateKey);
  });
  
  // Calculate true daily averages for each hour
  const hourlyAverages = Object.entries(hourlyData).map(([hour, data]) => ({
    hour: Number(hour),
    average: data.totalSteps / data.days.size
  }));
  
  console.log('Hourly averages:', hourlyAverages);
  
  return hourlyAverages.reduce((max, curr) => 
    curr.average > max.average ? curr : max
  );
}

// Find longest streak
function findLongestStreak(dailySteps) {
  const sortedDays = Object.entries(dailySteps)
    .sort(([a], [b]) => a.localeCompare(b));
  
  let currentStreak = 0;
  let longestStreak = 0;
  let streakStart = null;
  let streakEnd = null;
  let tempStart = null;
  
  sortedDays.forEach(([date, steps], i) => {
    if (steps >= STREAK_THRESHOLD) {
      if (currentStreak === 0) tempStart = date;
      currentStreak++;
      
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
        streakStart = tempStart;
        streakEnd = date;
      }
    } else {
      currentStreak = 0;
    }
  });
  
  return { length: longestStreak, start: streakStart, end: streakEnd };
}

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    console.log("File selected:", {
      name: file.name,
      type: file.type,
      size: file.size
    });

    // Show loading indicator
    landing.classList.add("hidden");
    const loadingEl = document.createElement("div");
    loadingEl.className = "loading-container";
    loadingEl.innerHTML = `
      <div class="loading-spinner"></div>
      <p>Processing your health data...</p>
    `;
    document.body.appendChild(loadingEl);

    let xmlText;
    
    if (file.name.endsWith('.zip')) {
      console.log("Processing ZIP file...");
      try {
        // Handle ZIP file
        const zipBlob = await file.arrayBuffer();
        console.log("ZIP blob loaded, size:", zipBlob.byteLength);
        
        const zip = await JSZip.loadAsync(zipBlob);
        console.log("ZIP loaded, files found:", Object.keys(zip.files));
        
        // Try to find export.xml in the root or in apple_health_export/
        let xmlFile = zip.file("export.xml") || zip.file("apple_health_export/export.xml");
        
        if (!xmlFile) {
          console.error("XML file not found in ZIP. Available files:", Object.keys(zip.files));
          throw new Error("Could not find export.xml in the ZIP file. Make sure you're uploading the correct export from Apple Health.");
        }
        
        console.log("Found XML file in ZIP, extracting...");
        xmlText = await xmlFile.async("string");
        console.log("XML extracted, length:", xmlText.length);
      } catch (zipError) {
        console.error("ZIP processing error:", zipError);
        throw zipError;
      }
    } else {
      console.log("Processing XML file directly...");
      xmlText = await file.text();
      console.log("XML loaded, length:", xmlText.length);
    }

    console.log("Parsing XML...");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    // Get all Record elements
    const records = Array.from(xmlDoc.getElementsByTagName("Record"));
    console.log(`Found ${records.length} total records`);
    
    // Get date window for last 12 complete months
    const dateWindow = getRollingYearWindow();
    console.log('Processing date window:', dateWindow);
    
    const stepRecords = records.filter(record => {
      const type = record.getAttribute("type");
      if (type !== STEP_TYPE) return false;
      
      const startDate = record.getAttribute("startDate");
      const normalizedDate = normalizeDate(startDate);
      const isInWindow = normalizedDate >= dateWindow.startStr && normalizedDate <= dateWindow.endStr;
      
      // Debug log a sample of records
      if (Math.random() < 0.001) {
        console.log('Sample record:', {
          date: startDate,
          normalizedDate,
          isInWindow,
          window: `${dateWindow.startStr} to ${dateWindow.endStr}`
        });
      }
      
      return isInWindow;
    });
    
    console.log(`Found ${stepRecords.length} step records in date window`);

    // Aggregate steps by day
    const dailySteps = {};
    for (const record of stepRecords) {
      const startDate = record.getAttribute("startDate");
      const day = normalizeDate(startDate);
      const steps = Number(record.getAttribute("value"));
      dailySteps[day] = (dailySteps[day] || 0) + steps;
    }
    
    console.log('Daily steps object:', {
      numberOfDays: Object.keys(dailySteps).length,
      dateRange: `${dateWindow.startStr} to ${dateWindow.endStr}`,
      sampleDay: Object.entries(dailySteps)[0],
      totalSteps: Object.values(dailySteps).reduce((a, b) => a + b, 0)
    });

    // Calculate additional metrics
    const totalMiles = Object.values(dailySteps).reduce((a, b) => a + b, 0) * MILES_PER_STEP;
    const totalCalories = (Object.values(dailySteps).reduce((a, b) => a + b, 0) / 1000) * CALORIES_PER_1000_STEPS;
    const pizzaSlices = Math.round(totalCalories / CALORIES_PER_PIZZA_SLICE);
    const carTrips = Math.round(totalMiles / MILES_PER_CAR_TRIP);
    const marathons = (totalMiles / MILES_PER_MARATHON).toFixed(1);

    // Find distance fact
    const distanceFact = DISTANCE_FACTS.find(d => totalMiles <= d.threshold)?.fact || DISTANCE_FACTS[0].fact;

    // Find longest streak
    const streak = findLongestStreak(dailySteps);
    console.log('Streak data:', streak);

    // Calculate activity level
    const avgDailySteps = Object.values(dailySteps).reduce((a, b) => a + b, 0) / Object.keys(dailySteps).length;
    const activityBadge = getActivityBadge(avgDailySteps);
    
    // Generate facts
    const facts = generateWrappedFacts(dailySteps, {
      streak,
      totalMiles,
      distanceFact,
      totalCalories,
      pizzaSlices,
      carTrips,
      marathons,
      activityBadge
    });
    
    // Remove loading indicator
    loadingEl.remove();
    
    buildSlides(facts);
    startSlideshow();
  } catch (err) {
    console.error("Full error details:", {
      message: err.message,
      stack: err.stack,
      type: err.name
    });
    alert("Failed to parse file: " + err.message);
    // Clean up on error
    document.querySelector(".loading-container")?.remove();
    landing.classList.remove("hidden");
  }
});

function generateWrappedFacts(dailySteps, additionalData) {
  const days = Object.keys(dailySteps).sort();
  if (days.length === 0) return ["No step data found in the last 12 months"];
  
  try {
    const totalSteps = Object.values(dailySteps).reduce((a, b) => a + b, 0);
    const avgSteps = Math.round(totalSteps / days.length);
    
    // Find best day - add safe default
    const bestDay = Object.entries(dailySteps)
      .reduce((a, b) => (b[1] > a[1] ? b : a), [days[0], 0]);
    
    // Format the date nicely
    const bestDayDate = new Date(bestDay[0]);
    const bestDayFormatted = bestDayDate.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
      
    // Calculate day of week averages
    const dowTotals = {};
    const dowCounts = {};
    for (const [date, steps] of Object.entries(dailySteps)) {
      const dow = new Date(date).getDay();
      dowTotals[dow] = (dowTotals[dow] || 0) + steps;
      dowCounts[dow] = (dowCounts[dow] || 0) + 1;
    }
    
    const dowAverages = {};
    for (const dow in dowTotals) {
      dowAverages[dow] = Math.round(dowTotals[dow] / dowCounts[dow]);
    }
    
    // Add safe default for best day of week
    const bestDow = Object.entries(dowAverages)
      .reduce((a, b) => (b[1] > a[1] ? b : a), ['0', 0]);
      
    const daysOver10k = Object.values(dailySteps)
      .filter(steps => steps >= 10000).length;
    const percentOver10k = Math.round((daysOver10k / days.length) * 100);
    
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Format streak dates with safe defaults
    const streakStart = additionalData.streak.start ? 
      new Date(additionalData.streak.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) :
      'N/A';
    const streakEnd = additionalData.streak.end ?
      new Date(additionalData.streak.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) :
      'N/A';
    
    // Get year range for title
    const startYear = new Date(days[0]).getFullYear();
    const endYear = new Date(days[days.length - 1]).getFullYear();
    const yearRange = startYear === endYear ? 
      `'${startYear.toString().slice(2)}` : 
      `'${startYear.toString().slice(2)}-'${endYear.toString().slice(2)}`;
    
    // Calculate consistency score and best month with safe defaults
    const consistencyScore = calculateConsistencyScore(dailySteps);
    const bestMonth = findBestMonth(dailySteps) || 'N/A';
    
    // Main stats
    const mainStats = [
      `🦶 You took ${totalSteps.toLocaleString()} steps in the last year!`,
      `📈 That's an average of ${avgSteps.toLocaleString()} steps per day.`,
      `🏆 Your best day was ${bestDayFormatted} with ${bestDay[1].toLocaleString()} steps!`,
      `📅 You walk most on ${DAYS[bestDow[0]]}s (avg ${bestDow[1].toLocaleString()} steps)`,
      {
        text: `🎯 You hit 10,000+ steps on ${percentOver10k}% of days`,
        progressBar: {
          percent: percentOver10k,
          color: '#1DB954'
        }
      },
      `🔥 Longest streak of 6,500+ steps: ${additionalData.streak.length || 0} days ${streakStart !== 'N/A' ? `(${streakStart} → ${streakEnd})` : ''}`,
      `💪 You've walked ${Math.round(additionalData.totalMiles).toLocaleString()} miles...\n${additionalData.distanceFact}`
    ];

    // Format achievements as a single shareable slide
    const achievementSlide = [{
      shareableRecap: {
        title: `My Steps Wrapped ${yearRange}`,
        stats: [
          `🚶‍♂️ Activity Level: ${additionalData.activityBadge}`,
          `👣 Total Steps: ${totalSteps.toLocaleString()}`,
          `📈 Daily Average: ${avgSteps.toLocaleString()} steps`,
          `💫 Best Day: ${bestDay[1].toLocaleString()} steps`,
          `📅 Most Active: ${DAYS[bestDow[0]]}s`,
          `📊 Consistency Score: ${consistencyScore}/100`,
          `📈 Peak Performance: ${bestMonth}`
        ]
      }
    }];

    return [...mainStats, ...achievementSlide];
  } catch (error) {
    console.error('Error generating facts:', error);
    return ["Sorry, there was an error processing your data. Please try again."];
  }
}

function generateDayOfWeekSeries(dailySteps) {
  const dowTotals = {};
  const dowCounts = {};
  
  for (const [date, steps] of Object.entries(dailySteps)) {
    const dow = new Date(date).getDay();
    dowTotals[dow] = (dowTotals[dow] || 0) + steps;
    dowCounts[dow] = (dowCounts[dow] || 0) + 1;
  }
  
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return DAYS.map((day, i) => ({
    day,
    average: Math.round(dowTotals[i] / dowCounts[i] || 0)
  }));
}

function buildSlides(facts) {
  // Clear existing slides
  slidesContainer.innerHTML = '';
  
  facts.forEach((fact, i) => {
    // Skip empty facts (used for spacing)
    if (!fact) return;

    const slide = document.createElement('div');
    slide.className = 'slide';
    
    // Handle different fact types
    if (typeof fact === 'object') {
      if (fact.shareableRecap) {
        // Create shareable recap slide
        slide.className = 'slide recap';
        slide.style.backgroundColor = '#1E1E1E';
        
        const content = document.createElement('div');
        content.className = 'recap-content';
        
        const title = document.createElement('h2');
        title.className = 'recap-title';
        title.textContent = fact.shareableRecap.title;
        content.appendChild(title);
        
        const stats = document.createElement('div');
        stats.className = 'recap-stats';
        fact.shareableRecap.stats.forEach(stat => {
          const p = document.createElement('p');
          p.textContent = stat;
          stats.appendChild(p);
        });
        content.appendChild(stats);
        
        const shareButton = document.createElement('button');
        shareButton.className = 'share-button';
        shareButton.textContent = 'Share My Recap';
        shareButton.onclick = async () => {
          try {
            const canvas = await html2canvas(content, {
              backgroundColor: '#1E1E1E',
              scale: 2,
            });
            
            canvas.toBlob(async (blob) => {
              if (navigator.share) {
                const file = new File([blob], 'steps-wrapped.png', { type: 'image/png' });
                try {
                  await navigator.share({
                    files: [file],
                    title: 'My Steps Wrapped',
                    text: 'Check out my year in steps!'
                  });
                } catch (err) {
                  const link = document.createElement('a');
                  link.download = 'steps-wrapped.png';
                  link.href = URL.createObjectURL(blob);
                  link.click();
                }
              } else {
                const link = document.createElement('a');
                link.download = 'steps-wrapped.png';
                link.href = URL.createObjectURL(blob);
                link.click();
              }
            });
          } catch (err) {
            console.error('Failed to share:', err);
          }
        };
        content.appendChild(shareButton);
        
        slide.appendChild(content);
      } else if (fact.progressBar) {
        // Create fact with progress bar
        slide.style.backgroundColor = COLORS[i % COLORS.length];
        
        const text = document.createElement('h2');
        text.textContent = fact.text;
        slide.appendChild(text);
        
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.style.width = `${fact.progressBar.percent}%`;
        progressBar.style.backgroundColor = fact.progressBar.color;
        
        progressContainer.appendChild(progressBar);
        slide.appendChild(progressContainer);
      } else if (fact.impactStats) {
        // Create impact stats slide
        slide.className = 'slide impact';
        slide.style.backgroundColor = COLORS[i % COLORS.length];
        
        const title = document.createElement('h2');
        title.className = 'impact-title';
        title.textContent = fact.impactStats.title;
        slide.appendChild(title);
        
        const statsContainer = document.createElement('div');
        statsContainer.className = 'impact-stats';
        
        fact.impactStats.stats.forEach(stat => {
          const statElement = document.createElement('p');
          statElement.textContent = stat;
          statsContainer.appendChild(statElement);
        });
        
        slide.appendChild(statsContainer);
      }
    } else {
      // Regular text slide
      slide.style.backgroundColor = COLORS[i % COLORS.length];
      
      const text = document.createElement('h2');
      text.textContent = fact;
      
      // Add special styling for achievement header
      if (fact.includes('Your Achievements')) {
        text.style.fontSize = '3rem';
        text.style.fontWeight = 'bold';
      }
      
      slide.appendChild(text);
    }
    
    slide.style.color = '#fff';
    slidesContainer.appendChild(slide);
  });
}

function startSlideshow() {
  const slides = document.querySelectorAll('.slide');
  let currentSlide = 0;
  
  // Show first slide
  slides[0].style.opacity = 1;
  slides[0].style.transform = 'translateX(0)';
  slidesContainer.classList.remove('hidden');
  
  // Handle clicks/taps
  document.addEventListener('click', () => {
    if (currentSlide >= slides.length - 1) return;
    
    slides[currentSlide].style.opacity = 0;
    slides[currentSlide].style.transform = 'translateX(-100%)';
    currentSlide++;
    slides[currentSlide].style.opacity = 1;
    slides[currentSlide].style.transform = 'translateX(0)';
  });
  
  // Handle keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      if (currentSlide >= slides.length - 1) return;
      
      slides[currentSlide].style.opacity = 0;
      slides[currentSlide].style.transform = 'translateX(-100%)';
      currentSlide++;
      slides[currentSlide].style.opacity = 1;
      slides[currentSlide].style.transform = 'translateX(0)';
    }
  });
} 