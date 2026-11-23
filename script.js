/* =========================================================
   FRESHTRACK - SMART FOOD EXPIRY & WASTE TRACKER
   Frontend: HTML, CSS, JavaScript
   Storage: Browser localStorage
========================================================= */

/* =========================================================
   1. GLOBAL VARIABLES AND HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);

const STORAGE = {
  users: "freshtrack_users",
  currentUser: "freshtrack_current_user",
  foods: "freshtrack_foods",
  shopping: "freshtrack_shopping",
  history: "freshtrack_history",
  donations: "freshtrack_donations",
  theme: "freshtrack_theme",
  dismissed: "freshtrack_dismissed_"
};

let foods = [];
let shoppingList = [];
let foodHistory = [];
let donations = [];
let currentUser = null;
let scanner = null;
let scannedProduct = null;
let toastTimer = null;

const today = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const dateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const escapeHTML = (value) => {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
};

const money = (value) => {
  return "₹" + Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });
};

const makeId = () => {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

function readJSON(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveData() {
  localStorage.setItem(STORAGE.foods, JSON.stringify(foods));
  localStorage.setItem(STORAGE.shopping, JSON.stringify(shoppingList));
  localStorage.setItem(STORAGE.history, JSON.stringify(foodHistory));
  localStorage.setItem(STORAGE.donations, JSON.stringify(donations));
}

function toast(message) {
  const element = $("toast");
  if (!element) return;

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.classList.remove("show");
  }, 3000);
}

function activeFoods() {
  return foods.filter(food => food.status === "active");
}

function daysLeft(expiryDate) {
  if (!expiryDate) return null;

  const expiry = new Date(expiryDate + "T00:00:00");
  if (Number.isNaN(expiry.getTime())) return null;

  return Math.round((expiry - today()) / 86400000);
}

function formatDate(dateValue) {
  if (!dateValue) return "Not specified";

  const date = new Date(dateValue + "T00:00:00");
  if (Number.isNaN(date.getTime())) return "Not specified";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function getExpiryStatus(food) {
  const days = daysLeft(food.expiry);

  if (days === null) {
    return { label: "No expiry date", className: "" };
  }

  if (days < 0) {
    return { label: "Expired", className: "expired" };
  }

  if (days === 0) {
    return { label: "Expires today", className: "warning" };
  }

  if (days <= 3) {
    return { label: `Expires in ${days} day${days === 1 ? "" : "s"}`, className: "warning" };
  }

  return { label: "Fresh", className: "" };
}

function foodValue(food) {
  return Number(food.price || 0);
}

function categoryEmoji(category) {
  const emojis = {
    Vegetables: "🥦",
    Fruits: "🍎",
    Dairy: "🥛",
    Grains: "🌾",
    Protein: "🥚",
    Snacks: "🍪",
    Other: "🍽️"
  };

  return emojis[category] || "🍽️";
}

/* =========================================================
   2. AUTHENTICATION
========================================================= */

function getUsers() {
  return readJSON(STORAGE.users, []);
}

function saveUsers(users) {
  localStorage.setItem(STORAGE.users, JSON.stringify(users));
}

function showAuth() {
  $("authScreen").classList.remove("hidden");
  $("appLayout").classList.add("hidden");
}

function showApp() {
  $("authScreen").classList.add("hidden");
  $("appLayout").classList.remove("hidden");
}

function updateAuthUser(user) {
  currentUser = user;

  $("sidebarProfileName").textContent = user.name || "FreshTrack User";
  $("sidebarProfileEmail").textContent = user.email || "Personal pantry";
  $("sidebarAvatar").textContent = (user.name || "F").charAt(0).toUpperCase();

  $("profileAvatar").textContent = (user.name || "F").charAt(0).toUpperCase();
  $("profileDisplayName").textContent = user.name || "FreshTrack User";
  $("profileDisplayEmail").textContent = user.email || "";

  $("profileName").value = user.name || "";
  $("profileEmail").value = user.email || "";
  $("profilePhone").value = user.phone || "";
}

function initAuth() {
  const storedEmail = localStorage.getItem(STORAGE.currentUser);

  if (storedEmail) {
    const user = getUsers().find(item => item.email === storedEmail);

    if (user) {
      updateAuthUser(user);
      loadData();
      showApp();
      renderAll();
      ensureAlertCenter();
      checkExpiryNotifications();
      return;
    }
  }

  showAuth();
}

$("showSignup").addEventListener("click", () => {
  $("loginForm").classList.add("hidden");
  $("signupForm").classList.remove("hidden");
  $("authTitle").textContent = "Create your account";
  $("authSubtitle").textContent = "Start organizing your pantry with FreshTrack.";
  $("signupError").textContent = "";
});

$("showLogin").addEventListener("click", () => {
  $("signupForm").classList.add("hidden");
  $("loginForm").classList.remove("hidden");
  $("authTitle").textContent = "Welcome back";
  $("authSubtitle").textContent = "Log in to manage your pantry and reduce food waste.";
  $("loginError").textContent = "";
});

$("signupForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("signupName").value.trim();
  const email = $("signupEmail").value.trim().toLowerCase();
  const phone = $("signupPhone").value.trim();
  const password = $("signupPassword").value;

  if (!name || !email || password.length < 6) {
    $("signupError").textContent = "Enter valid details and a password with at least 6 characters.";
    return;
  }

  const users = getUsers();

  if (users.some(user => user.email === email)) {
    $("signupError").textContent = "An account with this email already exists. Please log in.";
    return;
  }

  const user = {
    id: makeId(),
    name,
    email,
    phone,
    password
  };

  users.push(user);
  saveUsers(users);

  localStorage.setItem(STORAGE.currentUser, email);

  updateAuthUser(user);
  loadData();
  showApp();
  renderAll();
  ensureAlertCenter();

  toast("Your FreshTrack account has been created!");
});

$("loginForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const email = $("loginEmail").value.trim().toLowerCase();
  const password = $("loginPassword").value;

  const user = getUsers().find(item =>
    item.email === email && item.password === password
  );

  if (!user) {
    $("loginError").textContent = "Incorrect email or password. Please try again.";
    return;
  }

  localStorage.setItem(STORAGE.currentUser, email);

  updateAuthUser(user);
  loadData();
  showApp();
  renderAll();
  ensureAlertCenter();
  checkExpiryNotifications();

  toast("Welcome back to FreshTrack!");
});

function logout() {
  localStorage.removeItem(STORAGE.currentUser);
  currentUser = null;

  if (scanner) {
    stopBarcodeScanner();
  }

  const panel = $("freshtrackAlertCenter");
  if (panel) panel.remove();

  showAuth();
  toast("You have logged out.");
}

$("logoutBtn").addEventListener("click", logout);

/* =========================================================
   3. DATA LOADING
========================================================= */

function loadData() {
  foods = readJSON(STORAGE.foods, []);
  shoppingList = readJSON(STORAGE.shopping, []);
  foodHistory = readJSON(STORAGE.history, []);
  donations = readJSON(STORAGE.donations, []);

  // Compatibility with older records
  foods = foods.map(food => ({
    ...food,
    status: food.status || "active"
  }));
}

/* =========================================================
   4. NAVIGATION
========================================================= */

function openView(viewId) {
  document.querySelectorAll(".view").forEach(view => {
    view.classList.remove("active-view");
  });

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.target === viewId);
  });

  const target = $(viewId);

  if (!target) return;

  target.classList.add("active-view");

  const activeButton = document.querySelector(
    `.nav-link[data-target="${viewId}"]`
  );

  $("pageTitle").textContent = activeButton
    ? activeButton.textContent.trim()
    : "My profile";

  if (viewId === "recipes") renderRecipes();
  if (viewId === "shopping") renderShopping();
  if (viewId === "nutrition") renderNutrition();
  if (viewId === "waste") renderWaste();
  if (viewId === "donate") renderDonations();
  if (viewId === "profile") updateAuthUser(currentUser);
}

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => {
    openView(button.dataset.target);
  });
});

document.querySelectorAll("[data-open]").forEach(button => {
  button.addEventListener("click", () => {
    openView(button.dataset.open);
  });
});

$("profileShortcut").addEventListener("click", () => {
  openView("profile");
});

/* =========================================================
   5. FOOD INVENTORY - ADD AND EDIT
========================================================= */

function resetFoodForm() {
  $("foodForm").reset();
  $("editFoodId").value = "";
  $("foodFormTitle").textContent = "＋ Add a food item";
  $("saveFoodBtn").textContent = "Save food item";
  $("cancelEditBtn").classList.add("hidden");
}

$("foodForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const id = $("editFoodId").value;

  const foodData = {
    name: $("foodName").value.trim(),
    category: $("category").value,
    quantity: Number($("quantity").value),
    unit: $("unit").value,
    expiry: $("expiryDate").value,
    price: Number($("foodPrice").value || 0)
  };

  if (!foodData.name || !foodData.expiry || foodData.quantity <= 0) {
    toast("Please enter valid food details.");
    return;
  }

  if (id) {
    const index = foods.findIndex(food => food.id === id);

    if (index !== -1) {
      foods[index] = {
        ...foods[index],
        ...foodData
      };
    }

    toast("Food item updated successfully!");
  } else {
    foods.push({
      id: makeId(),
      ...foodData,
      status: "active",
      createdAt: new Date().toISOString()
    });

    toast(`${foodData.name} added to your inventory!`);
    sendActionNotification(
      "Food added",
      `${foodData.name} has been added to your pantry.`,
      "added-" + makeId()
    );
  }

  saveData();
  resetFoodForm();
  renderAll();
  checkExpiryNotifications();
});

$("cancelEditBtn").addEventListener("click", resetFoodForm);

function editFood(id) {
  const food = foods.find(item => item.id === id);
  if (!food) return;

  $("editFoodId").value = food.id;
  $("foodName").value = food.name;
  $("category").value = food.category;
  $("quantity").value = food.quantity;
  $("unit").value = food.unit;
  $("expiryDate").value = food.expiry;
  $("foodPrice").value = food.price;

  $("foodFormTitle").textContent = "✎ Edit food item";
  $("saveFoodBtn").textContent = "Update food item";
  $("cancelEditBtn").classList.remove("hidden");

  $("foodForm").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function deleteFood(id) {
  const food = foods.find(item => item.id === id);
  if (!food) return;

  if (!confirm(`Delete ${food.name} from your inventory?`)) return;

  foods = foods.filter(item => item.id !== id);
  saveData();
  renderAll();

  toast(`${food.name} removed from inventory.`);
  sendActionNotification(
    "Food removed",
    `${food.name} was removed from your pantry.`,
    "removed-" + makeId()
  );
}

function recordFoodAction(id, action) {
  const food = foods.find(item => item.id === id);

  if (!food || food.status !== "active") return;

  food.status = action === "consumed" ? "consumed" : "wasted";
  food.completedAt = new Date().toISOString();

  foodHistory.push({
    id: makeId(),
    foodId: food.id,
    name: food.name,
    category: food.category,
    price: food.price,
    quantity: food.quantity,
    action,
    date: new Date().toISOString()
  });

  saveData();
  renderAll();

  if (action === "consumed") {
    toast(`${food.name} marked as consumed. Great job!`);

    sendActionNotification(
      "Food consumed successfully",
      `${food.name} was consumed. You saved approximately ${money(food.price)}.`,
      "consumed-" + makeId()
    );
  } else {
    toast(`${food.name} marked as wasted.`);

    sendActionNotification(
      "Food waste recorded",
      `${food.name} was marked as wasted. Estimated value: ${money(food.price)}.`,
      "wasted-" + makeId(),
      true
    );
  }
}

/* =========================================================
   6. RENDER FOOD INVENTORY
========================================================= */

function renderInventory() {
  const list = $("foodList");
  const empty = $("emptyState");

  if (!list || !empty) return;

  const query = $("searchInput").value.trim().toLowerCase();

  const visibleFoods = activeFoods().filter(food =>
    food.name.toLowerCase().includes(query) ||
    food.category.toLowerCase().includes(query)
  );

  list.innerHTML = "";

  empty.classList.toggle("hidden", visibleFoods.length > 0);

  visibleFoods.forEach(food => {
    const status = getExpiryStatus(food);
    const days = daysLeft(food.expiry);

    let expiryClass = "";

    if (days !== null && days < 0) {
      expiryClass = "expiry-danger";
    } else if (days !== null && days <= 3) {
      expiryClass = "expiry-warning";
    }

    const card = document.createElement("article");
    card.className = "food-card";

    card.innerHTML = `
      <div class="food-card-top">
        <div>
          <h4>${categoryEmoji(food.category)} ${escapeHTML(food.name)}</h4>
          <p class="food-category">${escapeHTML(food.category)}</p>
        </div>
        <span class="status-pill ${status.className}">
          ${escapeHTML(status.label)}
        </span>
      </div>

      <p class="food-quantity">
        Quantity: ${escapeHTML(food.quantity)} ${escapeHTML(food.unit)}
      </p>

      <p class="food-expiry ${expiryClass}">
        Expiry: <strong>${formatDate(food.expiry)}</strong>
      </p>

      <p class="food-price">Estimated price: ${money(food.price)}</p>

      <div class="food-actions">
        <button class="mini-btn" data-action="edit">Edit</button>
        <button class="mini-btn" data-action="consumed">✓ Consumed</button>
        <button class="mini-btn delete" data-action="wasted">Wasted</button>
        <button class="mini-btn delete" data-action="delete">Delete</button>
      </div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener("click", () => {
      editFood(food.id);
    });

    card.querySelector('[data-action="consumed"]').addEventListener("click", () => {
      recordFoodAction(food.id, "consumed");
    });

    card.querySelector('[data-action="wasted"]').addEventListener("click", () => {
      recordFoodAction(food.id, "wasted");
    });

    card.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deleteFood(food.id);
    });

    list.appendChild(card);
  });
}

$("searchInput").addEventListener("input", renderInventory);

/* =========================================================
   7. DASHBOARD
========================================================= */

function renderDashboard() {
  const active = activeFoods();

  const expiring = active.filter(food => {
    const days = daysLeft(food.expiry);
    return days !== null && days >= 0 && days <= 3;
  });

  const expired = active.filter(food => {
    const days = daysLeft(food.expiry);
    return days !== null && days < 0;
  });

  const consumed = foodHistory.filter(item => item.action === "consumed");
  const saved = consumed.reduce((sum, item) => sum + Number(item.price || 0), 0);

  $("totalItems").textContent = active.length;
  $("expiringItems").textContent = expiring.length;
  $("expiredItems").textContent = expired.length;
  $("savedAmount").textContent = money(saved);
  $("dashboardSaved").textContent = money(saved);

  $("heroExpiryMessage").textContent = expiring.length
    ? `${expiring.length} food item(s) need your attention within the next 3 days.`
    : "Your pantry is looking good. Keep tracking your food.";

  const expiryList = $("expiryOverview");

  const attentionItems = [...expired, ...expiring]
    .sort((a, b) => daysLeft(a.expiry) - daysLeft(b.expiry))
    .slice(0, 5);

  expiryList.innerHTML = "";

  if (!attentionItems.length) {
    expiryList.innerHTML = `
      <div class="empty-message">
        No urgent expiry alerts. Your pantry is looking fresh!
      </div>
    `;
  } else {
    attentionItems.forEach(food => {
      const days = daysLeft(food.expiry);

      const row = document.createElement("div");
      row.className = "overview-item";

      row.innerHTML = `
        <div class="overview-details">
          <strong>${categoryEmoji(food.category)} ${escapeHTML(food.name)}</strong>
          <small>${escapeHTML(food.quantity)} ${escapeHTML(food.unit)}</small>
        </div>
        <span class="overview-date ${days < 0 ? "expiry-danger" : "expiry-warning"}">
          ${days < 0 ? `${Math.abs(days)} day(s) ago` : days === 0 ? "Today" : `${days} day(s) left`}
        </span>
      `;

      expiryList.appendChild(row);
    });
  }

  const progress = Math.min(100, consumed.length * 10);

  $("impactProgress").style.width = progress + "%";
  $("impactCaption").textContent =
    `${consumed.length} item(s) consumed and recorded. Keep going!`;

  const tips = [
    "Check your pantry before shopping. Buying only what you need helps prevent food waste.",
    "Keep older groceries at the front of your refrigerator so you remember to use them first.",
    "Store fruits and vegetables correctly to help them stay fresh longer.",
    "Plan meals around ingredients that are close to their expiry date.",
    "Label leftovers with the date you prepared them."
  ];

  $("smartTip").textContent = tips[new Date().getDate() % tips.length];
}

/* =========================================================
   8. RECIPE IDEAS
========================================================= */

const recipes = [
  {
    name: "Vegetable Fried Rice",
    emoji: "🍚",
    time: "20 min",
    ingredients: ["rice", "carrot", "peas", "onion"],
    steps: [
      "Cook rice and allow it to cool.",
      "Chop the vegetables into small pieces.",
      "Heat a little oil and sauté onion and vegetables.",
      "Add rice, salt and your preferred seasoning.",
      "Mix well and serve warm."
    ]
  },
  {
    name: "Spinach Dal",
    emoji: "🥬",
    time: "30 min",
    ingredients: ["spinach", "dal", "tomato", "onion"],
    steps: [
      "Wash and chop spinach.",
      "Cook dal until soft.",
      "Add tomato, onion and spinach.",
      "Simmer with spices until cooked.",
      "Serve with rice or roti."
    ]
  },
  {
    name: "Tomato Potato Curry",
    emoji: "🍅",
    time: "25 min",
    ingredients: ["tomato", "potato", "onion"],
    steps: [
      "Wash and cut potatoes and tomatoes.",
      "Sauté onion in a pan.",
      "Add tomatoes, potatoes and spices.",
      "Add water and cook until potatoes are soft.",
      "Serve with rice or chapati."
    ]
  },
  {
    name: "Banana Oat Pancakes",
    emoji: "🥞",
    time: "15 min",
    ingredients: ["banana", "oats", "milk", "egg"],
    steps: [
      "Mash a ripe banana.",
      "Mix with oats, milk and egg.",
      "Heat a lightly greased pan.",
      "Pour small portions of batter.",
      "Cook both sides until golden."
    ]
  },
  {
    name: "Paneer Veggie Stir-fry",
    emoji: "🧀",
    time: "20 min",
    ingredients: ["paneer", "capsicum", "onion", "tomato"],
    steps: [
      "Cut paneer and vegetables into cubes.",
      "Heat oil in a pan.",
      "Sauté onion and capsicum.",
      "Add tomato, paneer and spices.",
      "Cook for a few minutes and serve."
    ]
  },
  {
    name: "Apple Milk Smoothie",
    emoji: "🍎",
    time: "5 min",
    ingredients: ["apple", "milk", "banana"],
    steps: [
      "Wash and chop the apple.",
      "Add apple, milk and banana to a blender.",
      "Blend until smooth.",
      "Serve immediately."
    ]
  },
  {
    name: "Egg Tomato Omelette",
    emoji: "🍳",
    time: "10 min",
    ingredients: ["egg", "tomato", "onion"],
    steps: [
      "Beat the eggs in a bowl.",
      "Chop tomato and onion.",
      "Mix the vegetables with the eggs.",
      "Pour into a heated pan.",
      "Cook both sides until done."
    ]
  },
  {
    name: "Simple Potato Sandwich",
    emoji: "🥪",
    time: "15 min",
    ingredients: ["potato", "bread", "onion", "tomato"],
    steps: [
      "Boil and mash the potato.",
      "Mix with chopped onion and tomato.",
      "Spread the mixture over bread.",
      "Toast until lightly crisp.",
      "Serve warm."
    ]
  },
  {
    name: "Fruit Bowl",
    emoji: "🍓",
    time: "10 min",
    ingredients: ["apple", "banana", "orange"],
    steps: [
      "Wash the fruits thoroughly.",
      "Peel and chop the fruits.",
      "Combine them in a bowl.",
      "Serve fresh."
    ]
  }
];

function renderRecipes() {
  const list = $("recipeList");
  const summary = $("recipeSummary");
  const empty = $("recipeEmpty");

  if (!list || !summary || !empty) return;

  const pantry = activeFoods();

  if (!pantry.length) {
    list.innerHTML = "";
    summary.textContent = "Your recipe ideas will appear here when you add food to your inventory.";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  const availableNames = pantry.map(food => food.name.toLowerCase());

  const rankedRecipes = recipes.map(recipe => {
    const matched = recipe.ingredients.filter(ingredient =>
      availableNames.some(name => name.includes(ingredient))
    );

    const missing = recipe.ingredients.filter(ingredient =>
      !availableNames.some(name => name.includes(ingredient))
    );

    const urgent = pantry.filter(food => {
      const days = daysLeft(food.expiry);

      return days !== null &&
        days >= 0 &&
        days <= 3 &&
        recipe.ingredients.some(ingredient =>
          food.name.toLowerCase().includes(ingredient)
        );
    });

    return {
      ...recipe,
      matched,
      missing,
      urgent,
      score: matched.length + urgent.length * 2
    };
  }).filter(recipe => recipe.matched.length > 0)
    .sort((a, b) => b.score - a.score);

  summary.textContent =
    `${rankedRecipes.length} recipe idea(s) found using ingredients in your pantry.`;

  list.innerHTML = "";

  if (!rankedRecipes.length) {
    list.innerHTML = `
      <div class="empty-message">
        No matching recipes found yet. Add vegetables, fruits, grains or other ingredients to your inventory.
      </div>
    `;
    return;
  }

  rankedRecipes.forEach((recipe, index) => {
    const card = document.createElement("article");
    card.className = "recipe-card";

    const urgentNames = recipe.urgent.map(food => food.name);

    card.innerHTML = `
      <div class="recipe-card-top">
        <span class="recipe-emoji">${recipe.emoji}</span>
        <span class="recipe-time">◷ ${escapeHTML(recipe.time)}</span>
      </div>

      <h3>${escapeHTML(recipe.name)}</h3>

      <p class="recipe-match">
        <strong>Available:</strong>
        ${recipe.matched.map(escapeHTML).join(", ")}
      </p>

      <p class="recipe-missing">
        <strong>Missing:</strong>
        ${recipe.missing.length
          ? recipe.missing.map(escapeHTML).join(", ")
          : "Nothing. You have all listed ingredients!"}
      </p>

      ${urgentNames.length ? `
        <p class="recipe-urgent">
          ✦ Use soon: ${urgentNames.map(escapeHTML).join(", ")}
        </p>
      ` : ""}

      <button class="secondary-btn recipe-toggle" type="button">
        View cooking steps
      </button>

      <div class="recipe-steps hidden">
        <strong>How to prepare</strong>
        <ol>
          ${recipe.steps.map(step => `<li>${escapeHTML(step)}</li>`).join("")}
        </ol>
      </div>
    `;

    const toggle = card.querySelector(".recipe-toggle");
    const steps = card.querySelector(".recipe-steps");

    toggle.addEventListener("click", () => {
      const isHidden = steps.classList.toggle("hidden");
      toggle.textContent = isHidden ? "View cooking steps" : "Hide cooking steps";
    });

    list.appendChild(card);
  });
}

$("refreshRecipesBtn").addEventListener("click", () => {
  renderRecipes();
  toast("Recipe ideas refreshed!");
});

/* =========================================================
   9. SMART SHOPPING RECOMMENDATIONS
========================================================= */

const recommendedGroceries = [
  {
    name: "Milk",
    category: "Dairy",
    reason: "A useful everyday staple."
  },
  {
    name: "Tomatoes",
    category: "Vegetables",
    reason: "Useful for many everyday meals."
  },
  {
    name: "Onions",
    category: "Vegetables",
    reason: "A versatile cooking ingredient."
  },
  {
    name: "Bananas",
    category: "Fruits",
    reason: "An easy fruit option for snacks."
  },
  {
    name: "Eggs",
    category: "Protein",
    reason: "A versatile protein source."
  },
  {
    name: "Rice",
    category: "Grains",
    reason: "A common pantry staple."
  },
  {
    name: "Spinach",
    category: "Vegetables",
    reason: "Useful for quick vegetable dishes."
  },
  {
    name: "Apples",
    category: "Fruits",
    reason: "A convenient snack option."
  }
];

function renderRecommendations() {
  const container = $("shoppingRecommendations");
  if (!container) return;

  const currentNames = activeFoods().map(food => food.name.toLowerCase());

  const suggestions = recommendedGroceries.filter(item =>
    !currentNames.some(name => name.includes(item.name.toLowerCase()))
  );

  container.innerHTML = "";

  if (!suggestions.length) {
    container.innerHTML = `
      <div class="empty-message">
        Your pantry already contains all the items in this recommendation list.
      </div>
    `;
    return;
  }

  suggestions.forEach(item => {
    const card = document.createElement("div");
    card.className = "recommendation-card";

    card.innerHTML = `
      <h4>${categoryEmoji(item.category)} ${escapeHTML(item.name)}</h4>
      <p>${escapeHTML(item.reason)}</p>
      <button class="secondary-btn" type="button">＋ Add to shopping list</button>
    `;

    card.querySelector("button").addEventListener("click", () => {
      addShoppingItem(item.name);
    });

    container.appendChild(card);
  });
}

function addShoppingItem(name) {
  const exists = shoppingList.some(item =>
    item.name.toLowerCase() === name.toLowerCase()
  );

  if (exists) {
    toast(`${name} is already on your shopping list.`);
    return;
  }

  shoppingList.push({
    id: makeId(),
    name,
    completed: false
  });

  saveData();
  renderShopping();

  toast(`${name} added to your shopping list!`);

  sendActionNotification(
    "Shopping list updated",
    `${name} was added to your shopping list.`,
    "shopping-" + makeId()
  );
}

$("shoppingForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("shoppingInput").value.trim();

  if (!name) return;

  addShoppingItem(name);
  $("shoppingInput").value = "";
});

function renderShopping() {
  const list = $("shoppingList");
  const empty = $("shoppingEmpty");

  if (!list || !empty) return;

  list.innerHTML = "";

  $("shoppingCount").textContent =
    `${shoppingList.length} item${shoppingList.length === 1 ? "" : "s"}`;

  empty.classList.toggle("hidden", shoppingList.length > 0);

  shoppingList.forEach(item => {
    const row = document.createElement("div");

    row.className = `shopping-row ${item.completed ? "completed" : ""}`;

    row.innerHTML = `
      <input type="checkbox" ${item.completed ? "checked" : ""} aria-label="Mark ${escapeHTML(item.name)} as purchased">
      <span>${escapeHTML(item.name)}</span>
      <button type="button" aria-label="Remove ${escapeHTML(item.name)}">×</button>
    `;

    row.querySelector("input").addEventListener("change", (event) => {
      item.completed = event.target.checked;
      saveData();
      renderShopping();

      toast(item.completed
        ? `${item.name} marked as purchased.`
        : `${item.name} marked as not purchased.`);
    });

    row.querySelector("button").addEventListener("click", () => {
      shoppingList = shoppingList.filter(value => value.id !== item.id);
      saveData();
      renderShopping();
      toast(`${item.name} removed from shopping list.`);
    });

    list.appendChild(row);
  });

  renderRecommendations();
}

$("refreshRecommendationsBtn").addEventListener("click", () => {
  renderRecommendations();
  toast("Shopping recommendations refreshed.");
});

/* =========================================================
   10. NUTRITION INSIGHTS
========================================================= */

// Approximate values per 100 g, except milk per 100 ml.
// Values are general estimates and vary by food and preparation.

const nutritionData = [
  { name: "Apple", calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2 },
  { name: "Banana", calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
  { name: "Orange", calories: 47, protein: 0.9, carbs: 11.8, fat: 0.1 },
  { name: "Mango", calories: 60, protein: 0.8, carbs: 15, fat: 0.4 },
  { name: "Tomato", calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { name: "Potato", calories: 77, protein: 2, carbs: 17.5, fat: 0.1 },
  { name: "Carrot", calories: 41, protein: 0.9, carbs: 9.6, fat: 0.2 },
  { name: "Spinach", calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
  { name: "Broccoli", calories: 34, protein: 2.8, carbs: 6.6, fat: 0.4 },
  { name: "Onion", calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1 },
  { name: "Rice", calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  { name: "Oats", calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 },
  { name: "Milk", calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
  { name: "Paneer", calories: 265, protein: 18.3, carbs: 1.2, fat: 20.8 },
  { name: "Egg", calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5 },
  { name: "Chicken", calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { name: "Almonds", calories: 579, protein: 21.2, carbs: 21.6, fat: 49.9 },
  { name: "Bread", calories: 265, protein: 9, carbs: 49, fat: 3.2 },
  { name: "Yogurt", calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3 },
  { name: "Peas", calories: 81, protein: 5.4, carbs: 14.5, fat: 0.4 }
];

function renderNutrition() {
  const tbody = $("nutritionTable");
  if (!tbody) return;

  const active = activeFoods();

  $("nutritionCount").textContent = active.length;
  $("nutritionCategories").textContent =
    new Set(active.map(food => food.category)).size;

  $("nutritionFresh").textContent = active.filter(food => {
    const days = daysLeft(food.expiry);
    return days === null || days >= 0;
  }).length;

  $("nutritionSoon").textContent = active.filter(food => {
    const days = daysLeft(food.expiry);
    return days !== null && days >= 0 && days <= 3;
  }).length;

  tbody.innerHTML = nutritionData.map(item => `
    <tr>
      <td>${escapeHTML(item.name)}</td>
      <td>${item.calories} kcal</td>
      <td>${item.protein} g</td>
      <td>${item.carbs} g</td>
      <td>${item.fat} g</td>
    </tr>
  `).join("");
}

function showNutritionResult(item, source = "Built-in food guide") {
  const result = $("nutritionSearchResult");

  result.innerHTML = `
    <div class="nutrition-result-card">
      <div class="nutrition-result-heading">
        <h3>${escapeHTML(item.name)}</h3>
        <span class="nutrition-source">${escapeHTML(source)}</span>
      </div>

      <p class="muted small">Approximate nutrition per 100 g or 100 ml, where applicable.</p>

      <div class="nutrition-result-grid">
        <div>
          <strong>${Number(item.calories || 0).toFixed(0)}</strong>
          <span>Calories (kcal)</span>
        </div>
        <div>
          <strong>${Number(item.protein || 0).toFixed(1)}g</strong>
          <span>Protein</span>
        </div>
        <div>
          <strong>${Number(item.carbs || 0).toFixed(1)}g</strong>
          <span>Carbohydrates</span>
        </div>
        <div>
          <strong>${Number(item.fat || 0).toFixed(1)}g</strong>
          <span>Fat</span>
        </div>
      </div>

      <p class="muted small nutrition-disclaimer">
        Nutrition values are estimates. Check the product label for exact packaged-food information.
      </p>
    </div>
  `;
}

async function searchNutrition(name) {
  const result = $("nutritionSearchResult");
  const query = name.trim().toLowerCase();

  if (!query) return;

  result.innerHTML = `<p class="muted">Searching nutrition information...</p>`;

  const match = nutritionData.find(item =>
    item.name.toLowerCase() === query
  ) || nutritionData.find(item =>
    item.name.toLowerCase().includes(query) ||
    query.includes(item.name.toLowerCase())
  );

  if (match) {
    showNutritionResult(match);
    return;
  }

  // External lookup for packaged food.
  // Requires an internet connection.
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&search_simple=1&action=process&json=1&page_size=5`
    );

    if (!response.ok) throw new Error("Nutrition service unavailable");

    const data = await response.json();

    const product = (data.products || []).find(item =>
      item.product_name &&
      item.nutriments &&
      (
        item.nutriments["energy-kcal_100g"] !== undefined ||
        item.nutriments.proteins_100g !== undefined
      )
    );

    if (!product) {
      result.innerHTML = `
        <div class="empty-message">
          No nutrition details found for "${escapeHTML(name)}".
          Try a common food name such as apple, banana, rice or milk.
        </div>
      `;
      return;
    }

    showNutritionResult({
      name: product.product_name,
      calories: product.nutriments["energy-kcal_100g"] ??
        (product.nutriments["energy_100g"] ? product.nutriments["energy_100g"] / 4.184 : 0),
      protein: product.nutriments.proteins_100g || 0,
      carbs: product.nutriments.carbohydrates_100g || 0,
      fat: product.nutriments.fat_100g || 0
    }, "Open Food Facts");

  } catch (error) {
    result.innerHTML = `
      <div class="empty-message">
        Could not retrieve this food's nutrition details. Check your internet connection or try the built-in food guide.
      </div>
    `;
  }
}

$("nutritionSearchForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = $("nutritionSearchInput").value.trim();
  if (!name) return;

  $("nutritionSearchBtn").disabled = true;
  $("nutritionSearchBtn").textContent = "Searching...";

  try {
    await searchNutrition(name);
  } finally {
    $("nutritionSearchBtn").disabled = false;
    $("nutritionSearchBtn").textContent = "Search nutrition";
  }
});

/* =========================================================
   11. FOOD WASTE AND SAVINGS
========================================================= */

function renderWaste() {
  const consumed = foodHistory.filter(item => item.action === "consumed");
  const wasted = foodHistory.filter(item => item.action === "wasted");

  const saved = consumed.reduce((sum, item) =>
    sum + Number(item.price || 0), 0
  );

  const wastedValue = wasted.reduce((sum, item) =>
    sum + Number(item.price || 0), 0
  );

  $("wasteConsumed").textContent = consumed.length;
  $("wasteCount").textContent = wasted.length;
  $("wasteSaved").textContent = money(saved);
  $("wasteValue").textContent = money(wastedValue);
}

/* =========================================================
   12. DONATIONS
========================================================= */

$("donationForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const donation = {
    id: makeId(),
    food: $("donationFood").value.trim(),
    quantity: $("donationQty").value.trim(),
    date: $("donationDate").value,
    type: $("donationType").value,
    notes: $("donationNotes").value.trim(),
    createdAt: new Date().toISOString()
  };

  donations.push(donation);
  saveData();

  $("donationForm").reset();
  renderDonations();

  toast("Donation offer saved successfully!");

  sendActionNotification(
    "Donation offer saved",
    `${donation.food} was added to your donation offers.`,
    "donation-" + donation.id
  );
});

function renderDonations() {
  const list = $("donationList");
  const empty = $("donationEmpty");

  if (!list || !empty) return;

  list.innerHTML = "";
  empty.classList.toggle("hidden", donations.length > 0);

  donations.forEach(donation => {
    const card = document.createElement("div");
    card.className = "donation-card";

    card.innerHTML = `
      <div>
        <h4>♡ ${escapeHTML(donation.food)}</h4>
        <p>Quantity: ${escapeHTML(donation.quantity)}</p>
        <p>Type: ${escapeHTML(donation.type)}</p>
        <p>Available until: ${formatDate(donation.date)}</p>
        ${donation.notes
          ? `<p>Notes: ${escapeHTML(donation.notes)}</p>`
          : ""}
      </div>
      <button class="danger-btn" type="button">Remove</button>
    `;

    card.querySelector("button").addEventListener("click", () => {
      if (!confirm("Remove this donation offer?")) return;

      donations = donations.filter(item => item.id !== donation.id);
      saveData();
      renderDonations();

      toast("Donation offer removed.");
    });

    list.appendChild(card);
  });
}

/* =========================================================
   13. BARCODE SCANNER
========================================================= */

function setScannerMessage(message) {
  $("scannerMessage").textContent = message;
}

async function startBarcodeScanner() {
  if (!window.Html5Qrcode) {
    setScannerMessage("Barcode scanner library could not load. Check your internet connection.");
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setScannerMessage("Camera access is unavailable. Use localhost or HTTPS and allow camera permission.");
    return;
  }

  $("startScanBtn").disabled = true;
  setScannerMessage("Starting camera. Please allow camera permission if prompted.");

  try {
    scanner = new Html5Qrcode("reader");

    const cameras = await Html5Qrcode.getCameras();

    if (!cameras.length) {
      throw new Error("No camera was found on this device.");
    }

    const camera = cameras.find(item =>
      /back|rear|environment/i.test(item.label)
    ) || cameras[0];

    await scanner.start(
      camera.id,
      {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.5
      },
      async decodedText => {
        $("barcodeInput").value = decodedText;
        setScannerMessage(`Barcode detected: ${decodedText}`);

        await stopBarcodeScanner();
        await lookupBarcode(decodedText);
      },
      () => {
        // Normal frame-by-frame scan attempts.
      }
    );

    $("stopScanBtn").disabled = false;
    setScannerMessage("Camera is active. Place the barcode inside the scanning area.");

  } catch (error) {
    scanner = null;
    $("startScanBtn").disabled = false;
    $("stopScanBtn").disabled = true;

    setScannerMessage(
      error.message || "Could not start camera. Check your camera permissions."
    );
  }
}

async function stopBarcodeScanner() {
  if (!scanner) {
    $("startScanBtn").disabled = false;
    $("stopScanBtn").disabled = true;
    return;
  }

  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }

    await scanner.clear();
  } catch (error) {
    console.warn("Scanner stop issue:", error);
  }

  scanner = null;
  $("startScanBtn").disabled = false;
  $("stopScanBtn").disabled = true;
}

$("startScanBtn").addEventListener("click", startBarcodeScanner);
$("stopScanBtn").addEventListener("click", stopBarcodeScanner);

$("barcodeForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const code = $("barcodeInput").value.trim();

  if (!code) return;

  await lookupBarcode(code);
});

async function lookupBarcode(code) {
  const result = $("barcodeResult");

  result.innerHTML = `<p class="muted">Looking up product information...</p>`;

  scannedProduct = null;
  $("addScannedFoodBtn").classList.add("hidden");

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
    );

    if (!response.ok) {
      throw new Error("Product service unavailable.");
    }

    const data = await response.json();

    if (data.status !== 1 || !data.product) {
      result.innerHTML = `
        <div class="empty-message">
          Product not found for barcode ${escapeHTML(code)}.
          You can still add the item manually to your inventory.
        </div>
      `;

      setScannerMessage("No matching product was found.");
      return;
    }

    const product = data.product;

    scannedProduct = {
      code,
      name: product.product_name || product.product_name_en || "",
      category: product.categories_tags?.[0] || "Other",
      image: product.image_front_small_url || "",
      brand: product.brands || "Not specified"
    };

    result.innerHTML = `
      <div class="barcode-result-card">
        ${scannedProduct.image
          ? `<img src="${escapeHTML(scannedProduct.image)}" alt="Product image" style="width:90px;max-height:90px;object-fit:contain;float:right;">`
          : ""}
        <h4>${escapeHTML(scannedProduct.name || "Product found")}</h4>
        <p>Barcode: ${escapeHTML(code)}</p>
        <p>Brand: ${escapeHTML(scannedProduct.brand)}</p>
        <p>Category: ${escapeHTML(scannedProduct.category)}</p>
        <p>Source: Open Food Facts</p>
      </div>
    `;

    $("addScannedFoodBtn").classList.remove("hidden");
    setScannerMessage("Product information retrieved successfully.");

  } catch (error) {
    result.innerHTML = `
      <div class="empty-message">
        Could not connect to the product database. Check your internet connection or add the item manually.
      </div>
    `;

    setScannerMessage("Product lookup failed.");
  }
}

$("addScannedFoodBtn").addEventListener("click", () => {
  if (!scannedProduct || !scannedProduct.name) {
    toast("No product name is available. Please add the item manually.");
    return;
  }

  $("foodName").value = scannedProduct.name;
  $("category").value = "Other";
  $("quantity").value = "1";
  $("unit").value = "pieces";
  $("expiryDate").value = dateString(new Date(Date.now() + 7 * 86400000));
  $("foodPrice").value = "";

  openView("inventory");

  toast("Product details filled in. Add the expiry date and price before saving.");
  $("foodName").focus();
});

/* =========================================================
   14. NOTIFICATION CENTER
========================================================= */

function ensureAlertCenter() {
  if ($("freshtrackAlertCenter")) return;

  const panel = document.createElement("div");

  panel.id = "freshtrackAlertCenter";

  panel.style.cssText = `
    position: fixed;
    top: 76px;
    right: 22px;
    width: min(360px, calc(100vw - 32px));
    max-height: 420px;
    overflow-y: auto;
    z-index: 9998;
    padding: 15px;
    border-radius: 14px;
    display: none;
    font-family: Inter, sans-serif;
  `;

  panel.innerHTML = `
    <div class="ft-alert-head" style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin-bottom:12px;
      font-size:13px;
      font-weight:800;
    ">
      <span>🔔 Notifications</span>
      <button class="ft-alert-clear" type="button" style="
        border:0;
        cursor:pointer;
        font-size:10px;
        font-weight:700;
      ">Clear notifications</button>
    </div>
    <div class="ft-alert-list">
      <p class="ft-alert-empty" style="font-size:11px;text-align:center;padding:15px;">
        No new notifications.
      </p>
    </div>
  `;

  document.body.appendChild(panel);

  panel.querySelector(".ft-alert-clear").addEventListener("click", () => {
    const list = panel.querySelector(".ft-alert-list");

    list.querySelectorAll("[data-alert-key]").forEach(alert => {
      localStorage.setItem(
        STORAGE.dismissed + alert.dataset.alertKey,
        "1"
      );
    });

    list.innerHTML = `
      <p class="ft-alert-empty" style="font-size:11px;text-align:center;padding:15px;">
        All notifications cleared.
      </p>
    `;

    panel.style.display = "none";

    toast("All notifications cleared.");
  });

  $("notifyBtn").addEventListener("click", (event) => {
    event.stopPropagation();

    panel.style.display =
      panel.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", (event) => {
    if (
      panel.style.display === "block" &&
      !panel.contains(event.target) &&
      event.target !== $("notifyBtn")
    ) {
      panel.style.display = "none";
    }
  });
}

function addAlertToCenter(title, message, key, expired = false) {
  ensureAlertCenter();

  const panel = $("freshtrackAlertCenter");

  if (localStorage.getItem(STORAGE.dismissed + key) === "1") {
    return;
  }

  const list = panel.querySelector(".ft-alert-list");

  if (list.querySelector(`[data-alert-key="${CSS.escape(key)}"]`)) {
    return;
  }

  const empty = list.querySelector(".ft-alert-empty");
  if (empty) empty.remove();

  const item = document.createElement("div");

  item.dataset.alertKey = key;
  item.className = `ft-alert-item ${expired ? "expired" : ""}`;

  item.style.cssText = `
    padding:11px;
    border-left:4px solid #e5a000;
    border-radius:8px;
    margin-bottom:9px;
    font-size:11px;
    line-height:1.5;
  `;

  item.innerHTML = `
    <strong style="display:block;margin-bottom:3px;">
      ${escapeHTML(title)}
    </strong>
    <span>${escapeHTML(message)}</span>
    <small style="display:block;margin-top:5px;opacity:.7;">
      ${new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit"
      })}
    </small>
  `;

  list.prepend(item);
  panel.style.display = "block";
}

function sendActionNotification(title, message, key, expired = false) {
  addAlertToCenter(title, message, key, expired);
  toast(title + ": " + message);

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body: message,
        icon: ""
      });
    } catch (error) {
      console.warn("Browser notification unavailable:", error);
    }
  }
}

function checkExpiryNotifications() {
  const active = activeFoods();

  active.forEach(food => {
    const days = daysLeft(food.expiry);

    if (days === null) return;

    if (days < 0) {
      const key = `expired-${food.id}-${dateString(today())}`;

      addAlertToCenter(
        "Food expired",
        `${food.name} expired ${Math.abs(days)} day(s) ago. Check whether it is safe before deciding what to do.`,
        key,
        true
      );

      return;
    }

    if (days <= 3) {
      const key = `expiring-${food.id}-${dateString(today())}`;

      addAlertToCenter(
        "Food expiring soon",
        `${food.name} expires ${days === 0 ? "today" : `in ${days} day(s)`}. Consider using it soon.`,
        key
      );
    }
  });
}

/* =========================================================
   15. BROWSER NOTIFICATION PERMISSION
========================================================= */

async function enableBrowserNotifications() {
  if (!("Notification" in window)) {
    toast("This browser does not support notifications.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      toast("Browser notifications enabled!");

      new Notification("FreshTrack notifications enabled", {
        body: "You can now receive food expiry reminders while this page is open."
      });

      $("settingsNotifyBtn").textContent = "Notifications enabled";
    } else {
      toast("Notification permission was not granted.");
    }
  } catch (error) {
    toast("Could not enable browser notifications.");
  }
}

$("notifyBtn").addEventListener("dblclick", enableBrowserNotifications);

$("settingsNotifyBtn").addEventListener("click", enableBrowserNotifications);

/* =========================================================
   16. THEME MANAGEMENT
========================================================= */

function applyTheme(theme) {
  const dark = theme === "dark";

  document.body.classList.toggle("dark-mode", dark);

  $("themeBtn").textContent = dark ? "☾" : "☀";

  $("darkToggle").setAttribute(
    "aria-checked",
    dark ? "true" : "false"
  );

  localStorage.setItem(STORAGE.theme, theme);
}

function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE.theme) || "dark";
  applyTheme(savedTheme);
}

function toggleTheme() {
  const isDark = document.body.classList.contains("dark-mode");
  applyTheme(isDark ? "light" : "dark");
}

$("themeBtn").addEventListener("click", toggleTheme);
$("darkToggle").addEventListener("click", toggleTheme);

/* =========================================================
   17. PROFILE MANAGEMENT
========================================================= */

$("profileForm").addEventListener("submit", (event) => {
  event.preventDefault();

  if (!currentUser) return;

  const name = $("profileName").value.trim();
  const phone = $("profilePhone").value.trim();

  if (!name) {
    toast("Please enter your name.");
    return;
  }

  const users = getUsers();
  const index = users.findIndex(user => user.email === currentUser.email);

  if (index === -1) return;

  users[index] = {
    ...users[index],
    name,
    phone
  };

  saveUsers(users);
  updateAuthUser(users[index]);

  toast("Profile updated successfully!");
});

/* =========================================================
   18. EXPORT DATA
========================================================= */

$("exportBtn").addEventListener("click", () => {
  const exportData = {
    exportedAt: new Date().toISOString(),
    foods,
    shoppingList,
    foodHistory,
    donations
  };

  const blob = new Blob(
    [JSON.stringify(exportData, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "freshtrack-data.json";
  link.click();

  URL.revokeObjectURL(url);

  toast("Your FreshTrack data has been exported.");
});

/* =========================================================
   19. RESET APP DATA
========================================================= */

$("resetBtn").addEventListener("click", () => {
  const confirmed = confirm(
    "Are you sure you want to reset your food inventory, shopping list, history and donations? This cannot be undone."
  );

  if (!confirmed) return;

  foods = [];
  shoppingList = [];
  foodHistory = [];
  donations = [];

  saveData();

  // Remove stored dismissed-alert flags for this browser.
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(STORAGE.dismissed)) {
      localStorage.removeItem(key);
    }
  });

  const panel = $("freshtrackAlertCenter");

  if (panel) {
    panel.querySelector(".ft-alert-list").innerHTML = `
      <p class="ft-alert-empty" style="font-size:11px;text-align:center;padding:15px;">
        No new notifications.
      </p>
    `;
    panel.style.display = "none";
  }

  resetFoodForm();
  renderAll();

  toast("FreshTrack data has been reset.");
});

/* =========================================================
   20. FULL APP RENDER
========================================================= */

function renderAll() {
  renderDashboard();
  renderInventory();
  renderRecipes();
  renderShopping();
  renderNutrition();
  renderWaste();
  renderDonations();
}

/* =========================================================
   21. APP INITIALIZATION
========================================================= */

function initializeFreshTrack() {
  initTheme();
  initAuth();

  // Set sensible minimum dates for date inputs.
  if ($("expiryDate")) {
    $("expiryDate").min = dateString(today());
  }

  if ($("donationDate")) {
    $("donationDate").min = dateString(today());
  }
}

initializeFreshTrack();

