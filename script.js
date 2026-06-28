const body = document.body;
const searchInput = document.querySelector("#wiki-search");
const commandSearchInput = document.querySelector("#command-search");
const filterButtons = [...document.querySelectorAll("[data-filter]")];
const worldSections = [...document.querySelectorAll(".world-section")];
const searchGroups = [...document.querySelectorAll("[data-search-group]")];
const searchableItems = [...document.querySelectorAll("[data-search-item]")];
const commandCategories = [...document.querySelectorAll(".command-category")];
const commandRows = [...document.querySelectorAll(".command-row")];
const commandExtras = [...document.querySelectorAll("[data-command-extra]")];
const commandEmpty = document.querySelector("#command-empty");
const summaryText = document.querySelector("#search-summary-text");
const clearSearchButton = document.querySelector("#clear-search");
const emptySearch = document.querySelector("#empty-search");
const emptyClearButton = document.querySelector("#empty-clear");
const menuToggle = document.querySelector(".menu-toggle");
const sidebarClose = document.querySelector(".sidebar-close");
const sidebarScrim = document.querySelector(".sidebar-scrim");
const sidebarLinks = [...document.querySelectorAll(".wiki-sidebar nav a")];
const sidebarGroups = [...document.querySelectorAll(".sidebar-nav-group")];
const copyToast = document.querySelector("#copy-toast");
const commandCategorySet = new Set(commandCategories);
const focusedSearchTopics = [
  { selector: "#faq", label: "FAQ", terms: ["faq"] },
  { selector: "#getting-started", label: "Getting Started", terms: ["getting", "started", "beginner", "new"] },
  { selector: "#commands", label: "Commands", terms: ["command", "commands"] },
  { selector: "#rules", label: "Server Rules", terms: ["rule", "rules"] },
  { selector: "#overworld", label: "Overworld", terms: ["overworld"] },
  { selector: "#events", label: "Events", terms: ["event", "events"] },
  { selector: "#bosses-mobs", label: "Bosses & Mobs", terms: ["boss", "bosses", "mob", "mobs", "enemy", "enemies", "bestiary"] },
  { selector: "#beacons", label: "Beacons", terms: ["beacon", "beacons"] },
  { selector: "#staffs-rare-drops", label: "Staffs & Rare Drops", terms: ["staff", "staffs", "rare", "drop", "drops", "collectible", "collectibles"] },
  { selector: "#dungeons", label: "Dungeons", terms: ["dungeon", "dungeons"] },
  { selector: "#reforges", label: "Reforges", terms: ["reforge", "reforges", "reforging"] },
]
  .map((topic) => ({ ...topic, section: document.querySelector(topic.selector) }))
  .filter((topic) => topic.section);

let activeCategory = "all";
let toastTimer;

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stemSearchToken(token) {
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }

  return token;
}

function getSearchTokens(value) {
  return (normalize(value).match(/[a-z0-9]+/g) || []).map(stemSearchToken);
}

function fieldMatchesAllTokens(value, tokens) {
  if (!tokens.length) return true;
  const fieldTokens = new Set(getSearchTokens(value));
  return tokens.every((token) => fieldTokens.has(token));
}

function getItemTitleText(element) {
  const titleParts = [
    element.id || "",
    element.getAttribute("aria-label") || "",
    ...[...element.querySelectorAll("h2, h3, h4, summary, code")].map((node) => node.textContent),
  ];

  return titleParts.join(" ");
}

function scoreSearchMatch(element, query) {
  const tokens = getSearchTokens(query);
  if (!tokens.length) return Number.POSITIVE_INFINITY;

  const keywordText = element.dataset.search || "";
  const titleText = getItemTitleText(element);
  const bodyText = element.textContent || "";
  const strongText = `${element.id || ""} ${keywordText} ${titleText}`;
  const normalizedQuery = normalize(query);
  let score = 0;

  if (fieldMatchesAllTokens(titleText, tokens)) score += 24;
  if (fieldMatchesAllTokens(keywordText, tokens)) score += 18;
  if (fieldMatchesAllTokens(strongText, tokens)) score += 14;
  if (normalize(titleText).includes(normalizedQuery)) score += 10;
  if (normalize(keywordText).includes(normalizedQuery)) score += 8;
  if (fieldMatchesAllTokens(bodyText, tokens)) score += tokens.length > 1 ? 9 : 4;
  if (normalize(bodyText).includes(normalizedQuery)) score += 2;

  return score;
}

function matchesQuery(element, query) {
  const tokens = getSearchTokens(query);
  if (!tokens.length) return true;

  return scoreSearchMatch(element, query) >= (tokens.length > 1 ? 14 : 8);
}

function getFocusedSearchTopic(query) {
  const tokens = getSearchTokens(query);
  if (!tokens.length) return null;

  const firstToken = tokens[0];
  const topic = focusedSearchTopics.find((candidate) =>
    candidate.terms.map(stemSearchToken).includes(firstToken)
  );

  if (!topic) return null;

  return {
    ...topic,
    isExactQuery: tokens.length === 1,
  };
}

function isInsideFocusedTopic(element, topic) {
  return !topic || topic.section === element || topic.section.contains(element);
}

function matchesSearchItem(element, query, topic) {
  if (!query) return true;
  if (!isInsideFocusedTopic(element, topic)) return false;
  if (topic?.isExactQuery) return true;

  return matchesQuery(element, query);
}

function hasVisibleSearchItem(group) {
  return [...group.querySelectorAll("[data-search-item]")].some((item) => !item.hidden);
}

function isEffectivelyVisible(element) {
  return !element.hidden && !element.closest("[hidden]");
}

function closeNavigation() {
  body.classList.remove("nav-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open wiki navigation");
}

function openNavigation() {
  body.classList.add("nav-open");
  menuToggle.setAttribute("aria-expanded", "true");
  menuToggle.setAttribute("aria-label", "Close wiki navigation");
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the textarea fallback below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  textarea.remove();
  return copied;
}

function resetFilters() {
  activeCategory = "all";
  searchInput.value = "";
  if (commandSearchInput) {
    commandSearchInput.value = "";
  }
  filterButtons.forEach((button) => {
    const selected = button.dataset.filter === "all";
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  updateResults();
  searchInput.focus();
}

function updateResults() {
  const query = normalize(searchInput.value);
  const focusedTopic = getFocusedSearchTopic(query);

  searchableItems.forEach((item) => {
    item.hidden = !matchesSearchItem(item, query, focusedTopic);
  });

  updateCommandResults(query, focusedTopic);

  worldSections.forEach((section) => {
    const categoryMatches = activeCategory === "all" || section.dataset.category === activeCategory;
    const topicMatches = isInsideFocusedTopic(section, focusedTopic);
    const hasSearchMatch = hasVisibleSearchItem(section);
    section.hidden = !categoryMatches || !topicMatches || (Boolean(query) && !hasSearchMatch);
  });

  searchGroups
    .filter((group) => !group.classList.contains("world-section") && !commandCategorySet.has(group))
    .forEach((group) => {
      const topicMatches = isInsideFocusedTopic(group, focusedTopic);
      const hasSearchMatch = hasVisibleSearchItem(group);
      group.hidden = Boolean(query) && (!topicMatches || !hasSearchMatch);
    });

  const visibleGroups = searchGroups.filter(isEffectivelyVisible);
  const noResults = visibleGroups.length === 0;
  emptySearch.hidden = !noResults;

  if (query) {
    summaryText.textContent = noResults
      ? `No results for “${searchInput.value.trim()}”`
      : focusedTopic?.isExactQuery
        ? `Showing the ${focusedTopic.label} guide`
        : `Showing related matches for “${searchInput.value.trim()}”`;
  } else if (activeCategory !== "all") {
    const categoryLabels = {
      main: "main world entries",
      side: "side world entries",
      event: "limited-time event entries",
    };
    summaryText.textContent = `Showing ${categoryLabels[activeCategory]}`;
  } else {
    summaryText.textContent = "";
  }

  clearSearchButton.hidden = !query && activeCategory === "all";
  scheduleActiveNavigationUpdate();
}

function updateCommandResults(globalQuery = normalize(searchInput.value), focusedTopic = getFocusedSearchTopic(globalQuery)) {
  if (!commandRows.length) return;

  const commandQuery = commandSearchInput ? normalize(commandSearchInput.value) : "";
  let visibleMatches = 0;

  commandCategories.forEach((category) => {
    const rows = [...category.querySelectorAll(".command-row")];
    let visibleRows = 0;

    rows.forEach((row) => {
      const isVisible = matchesSearchItem(row, globalQuery, focusedTopic) && matchesQuery(row, commandQuery);
      row.hidden = !isVisible;
      if (isVisible) {
        visibleRows += 1;
        visibleMatches += 1;
      }
    });

    category.hidden = (Boolean(globalQuery) || Boolean(commandQuery)) && visibleRows === 0;
  });

  commandExtras.forEach((extra) => {
    const isVisible = matchesSearchItem(extra, globalQuery, focusedTopic) && matchesQuery(extra, commandQuery);
    extra.hidden = !isVisible;
    if (isVisible) visibleMatches += 1;
  });

  if (commandEmpty) {
    commandEmpty.hidden = !commandQuery || visibleMatches > 0;
  }
}

const filterTargetSelectors = {
  all: "#main-worlds",
  main: "#main-worlds",
  side: "#side-worlds",
  event: "#event-worlds",
};

function scrollToFilterTarget(category) {
  const targetSelector = filterTargetSelectors[category] || filterTargetSelectors.all;
  const targetSection = document.querySelector(targetSelector);
  const visibleSection = targetSection && !targetSection.hidden
    ? targetSection
    : worldSections.find((section) => !section.hidden);

  if (!visibleSection) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  visibleSection.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });

  if (visibleSection.id && window.history?.replaceState) {
    window.history.replaceState(null, "", `#${visibleSection.id}`);
  }

  scheduleActiveNavigationUpdate();
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.filter;
    filterButtons.forEach((candidate) => {
      const selected = candidate === button;
      candidate.classList.toggle("is-active", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    });
    updateResults();
    scrollToFilterTarget(activeCategory);
  });
});

searchInput.addEventListener("input", updateResults);

if (commandSearchInput) {
  commandSearchInput.addEventListener("input", () => updateCommandResults());
}

document.addEventListener("keydown", (event) => {
  const isTyping = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);

  if (event.key === "/" && !isTyping) {
    event.preventDefault();
    searchInput.focus();
  }

  if (event.key === "Escape") {
    if (body.classList.contains("nav-open")) {
      closeNavigation();
    } else if (commandSearchInput?.value) {
      resetFilters();
    } else if (searchInput.value || activeCategory !== "all") {
      resetFilters();
    }
  }
});

clearSearchButton?.addEventListener("click", resetFilters);
emptyClearButton?.addEventListener("click", resetFilters);

menuToggle.addEventListener("click", () => {
  body.classList.contains("nav-open") ? closeNavigation() : openNavigation();
});

sidebarClose.addEventListener("click", closeNavigation);
sidebarScrim.addEventListener("click", closeNavigation);
sidebarLinks.forEach((link) => link.addEventListener("click", closeNavigation));

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.dataset.copy;
    const copied = await copyText(value);
    copyToast.textContent = copied ? `${value} copied` : `Copy this: ${value}`;

    copyToast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => copyToast.classList.remove("is-visible"), 2200);
  });
});

const observedSections = [
  ...sidebarLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean),
];
const uniqueObservedSections = [...new Set(observedSections)];

let activeNavigationFrame;

function isVisibleSection(section) {
  return !section.hidden && section.offsetParent !== null;
}

function setActiveNavigation(section) {
  sidebarLinks.forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === `#${section.id}`);
  });

  sidebarGroups.forEach((group) => {
    const hasActiveLink = Boolean(group.querySelector("a.is-active"));
    group.classList.toggle("has-active", hasActiveLink);
    group.open = hasActiveLink;
  });
}

function findActiveSection() {
  const visibleSections = uniqueObservedSections.filter(isVisibleSection);
  const probeY = Math.min(window.innerHeight * 0.32, window.innerHeight - 1);
  let closestPreviousSection = visibleSections[0];

  for (const section of visibleSections) {
    const rect = section.getBoundingClientRect();

    if (rect.top <= probeY && rect.bottom > probeY) {
      return section;
    }

    if (rect.top <= probeY) {
      closestPreviousSection = section;
    }
  }

  return visibleSections.find((section) => section.getBoundingClientRect().bottom > 0) || closestPreviousSection;
}

function updateActiveNavigation() {
  activeNavigationFrame = undefined;
  const activeSection = findActiveSection();

  if (activeSection) {
    setActiveNavigation(activeSection);
  }
}

function scheduleActiveNavigationUpdate() {
  if (activeNavigationFrame) return;
  activeNavigationFrame = window.requestAnimationFrame(updateActiveNavigation);
}

const sectionObserver = new IntersectionObserver(
  scheduleActiveNavigationUpdate,
  {
    rootMargin: "-20% 0px -68% 0px",
    threshold: [0, 0.1, 0.3],
  }
);

uniqueObservedSections.forEach((section) => sectionObserver.observe(section));
window.addEventListener("scroll", scheduleActiveNavigationUpdate, { passive: true });
window.addEventListener("resize", scheduleActiveNavigationUpdate);
window.addEventListener("hashchange", scheduleActiveNavigationUpdate);

updateResults();
updateActiveNavigation();
