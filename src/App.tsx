import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Clock3,
  Heart,
  MapPin,
  Menu,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
  Zap,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getSession, login as apiLogin, signup as apiSignup } from "./services/authApi";
import { normalizeAuthError } from "./authMessages";
import FoodCard from "./components/FoodCard";
import {
  addFavorite,
  createOrder,
  createReview,
  loadCart,
  loadFavorites,
  loadOrders,
  loadPreferences,
  loadReviews,
  recordBehavior,
  removeFavorite,
  saveCart,
  savePreferences,
  updateOrderStage,
} from "./services/customerApi";
import { loadCatalogCategories, loadCatalogFoods, loadCatalogRestaurants } from "./services/catalogApi";
import { getRecommendations, type ApiRecommendation } from "./services/recommendationApi";
import "./App.css";

type Food = {
  id: number;
  name: string;
  restaurant: string;
  cuisine: string;
  category: string;
  price: number;
  rating: number;
  time: number;
  healthy: boolean;
  veg: boolean;
  vegan?: boolean;
  spice?: string;
  meal?: string;
  ingredients?: string[];
  image: string;
  match: number;
  reason: string;
};
type Preferences = {
  diet: "Vegetarian" | "Everything" | "Vegan";
  cuisines: string[];
  categories: string[];
  minBudget: number;
  maxBudget: number;
  spice: "Mild" | "Medium" | "Spicy";
  meal: "Breakfast" | "Lunch" | "Dinner" | "Snacks";
  health: "Healthy" | "Regular" | "Both";
  avoid: string;
};
type CartItem = { id: number; quantity: number };
type Order = {
  id: string;
  items: Array<CartItem & { name?: string; price?: number; restaurant?: string }>;
  total: number;
  placedAt: string;
  estimatedDelivery?: number;
  address: string;
  location: string;
  payment: string;
  stage: number;
  paymentStatus?: string;
  status?: string;
};
const ORDER_STAGES = ["Placed", "Confirmed", "Preparing", "Ready for pickup", "Out for delivery", "Delivered"];
type Restaurant = {
  id: number;
  name: string;
  cuisine: string;
  rating: number;
  delivery: number;
  fee: number;
  distance: string;
  image: string;
  description: string;
  menu_count?: number;
};
type Account = { name: string; email: string; token?: string };

const defaultPreferences: Preferences = {
  diet: "Vegetarian",
  cuisines: ["Indian", "Chinese"],
  categories: [],
  minBudget: 100,
  maxBudget: 300,
  spice: "Medium",
  meal: "Dinner",
  health: "Both",
  avoid: "",
};
const defaultFoodImage = "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85";
const defaultRestaurantImage = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=85";

function scoreFood(food: Food, preferences: Preferences) {
  let score = 58;
  const reasons: string[] = [];
  if (preferences.cuisines.includes(food.cuisine)) {
    score += 14;
    reasons.push(`${food.cuisine} cuisine`);
  }
  if (preferences.categories.includes(food.category)) {
    score += 10;
    reasons.push(`${food.category} picks`);
  }
  if (
    preferences.diet === "Everything" ||
    (preferences.diet === "Vegetarian" && food.veg) ||
    (preferences.diet === "Vegan" && food.vegan)
  ) {
    score += 12;
    reasons.push("your diet");
  }
  if (
    food.price >= preferences.minBudget &&
    food.price <= preferences.maxBudget
  ) {
    score += 8;
    reasons.push(`within ₹${preferences.maxBudget}`);
  } else score -= 6;
  if (!preferences.spice || food.spice === preferences.spice) {
    score += 6;
    reasons.push(`${preferences.spice.toLowerCase()} spice`);
  }
  if (food.meal === preferences.meal) {
    score += 5;
    reasons.push(`${preferences.meal.toLowerCase()} fit`);
  }
  if (
    preferences.avoid &&
    food.ingredients?.some((ingredient) =>
      preferences.avoid.toLowerCase().includes(ingredient.toLowerCase()),
    )
  )
    score -= 20;
  if (
    preferences.health === "Both" ||
    (preferences.health === "Healthy" && food.healthy) ||
    (preferences.health === "Regular" && !food.healthy)
  ) {
    score += 8;
    reasons.push(
      preferences.health === "Healthy"
        ? "healthy picks"
        : "your everyday taste",
    );
  }
  score += Math.round((food.rating - 4) * 8);
  return {
    match: Math.min(99, Math.max(52, score)),
    reason: reasons.slice(0, 2).join(" + ") || "a strong overall match",
  };
}
const bundledFoods: Food[] = [
  {
    id: 1,
    name: "Smoky Paneer Tikka Bowl",
    restaurant: "Saffron & Soil",
    cuisine: "Indian",
    category: "Healthy",
    price: 289,
    rating: 4.8,
    time: 24,
    healthy: true,
    veg: true,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85",
    match: 96,
    reason: "fits your Indian + healthy picks",
    ingredients: ["paneer", "yogurt", "bell pepper", "mint"],
  },
  {
    id: 2,
    name: "Crispy Chili Chicken",
    restaurant: "Wok Theory",
    cuisine: "Chinese",
    category: "Chinese",
    price: 319,
    rating: 4.7,
    time: 31,
    healthy: false,
    veg: false,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=900&q=85",
    match: 91,
    reason: "matches your craving for spice",
    ingredients: ["chicken", "chili", "garlic", "soy sauce"],
  },
  {
    id: 3,
    name: "Truffle Mushroom Melt",
    restaurant: "The Daily Crumb",
    cuisine: "Italian",
    category: "Pizza",
    price: 349,
    rating: 4.6,
    time: 27,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=900&q=85",
    match: 84,
    reason: "a cozy match for a low-spice night",
    ingredients: ["mushroom", "cheese", "truffle", "bread"],
  },
  {
    id: 4,
    name: "Mango Chia Cloud",
    restaurant: "Nourish Lab",
    cuisine: "Continental",
    category: "Healthy",
    price: 229,
    rating: 4.9,
    time: 18,
    healthy: true,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=900&q=85",
    match: 88,
    reason: "light, quick, and under your budget",
    ingredients: ["mango", "chia", "yogurt", "mint"],
  },
  {
    id: 5,
    name: "Lucknowi Mutton Biryani",
    restaurant: "Dum House",
    cuisine: "Indian",
    category: "Biryani",
    price: 399,
    rating: 4.8,
    time: 35,
    healthy: false,
    veg: false,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1563379091339-03246963d96c?auto=format&fit=crop&w=900&q=85",
    match: 90,
    reason: "a highly rated Indian comfort classic",
    ingredients: ["mutton", "basmati", "saffron", "onion"],
  },
  {
    id: 6,
    name: "Charred Corn Tacos",
    restaurant: "Mesa Verde",
    cuisine: "Mexican",
    category: "Healthy",
    price: 269,
    rating: 4.5,
    time: 22,
    healthy: true,
    veg: true,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=900&q=85",
    match: 86,
    reason: "spicy, fresh, and easy on the wallet",
    ingredients: ["corn", "beans", "avocado", "lime"],
  },
  {
    id: 7,
    name: "Butter Chicken Naan Box",
    restaurant: "Dum House",
    cuisine: "Indian",
    category: "North Indian",
    price: 329,
    rating: 4.7,
    time: 32,
    healthy: false,
    veg: false,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=900&q=85",
    match: 89,
    reason: "rich Indian comfort food for dinner",
    ingredients: ["chicken", "butter", "naan", "tomato"],
  },
  {
    id: 8,
    name: "Margherita Garden Pizza",
    restaurant: "The Daily Crumb",
    cuisine: "Italian",
    category: "Pizza",
    price: 299,
    rating: 4.5,
    time: 25,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=85",
    match: 85,
    reason: "a simple, highly rated classic",
    ingredients: ["mozzarella", "tomato", "basil", "pizza base"],
  },
  {
    id: 9,
    name: "Masala Dosa Plate",
    restaurant: "South Side Stories",
    cuisine: "South Indian",
    category: "South Indian",
    price: 179,
    rating: 4.6,
    time: 20,
    healthy: true,
    veg: true,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=900&q=85",
    match: 87,
    reason: "quick, comforting, and vegetarian",
    ingredients: ["dosa", "potato", "coconut chutney", "sambar"],
  },
  {
    id: 10,
    name: "Sesame Veggie Ramen",
    restaurant: "Wok Theory",
    cuisine: "Chinese",
    category: "Noodles",
    price: 279,
    rating: 4.6,
    time: 29,
    healthy: true,
    veg: true,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=85",
    match: 88,
    reason: "warm, spicy noodles with fresh toppings",
    ingredients: ["noodles", "broccoli", "sesame", "soy"],
  },
  {
    id: 11,
    name: "Salted Caramel Tres Leches",
    restaurant: "Nourish Lab",
    cuisine: "Continental",
    category: "Desserts",
    price: 189,
    rating: 4.8,
    time: 16,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=85",
    match: 83,
    reason: "a sweet finish with fast delivery",
    ingredients: ["milk", "cake", "caramel", "cream"],
  },
  {
    id: 12,
    name: "Yuzu Mint Cooler",
    restaurant: "Nourish Lab",
    cuisine: "Continental",
    category: "Beverages",
    price: 129,
    rating: 4.4,
    time: 14,
    healthy: true,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=85",
    match: 82,
    reason: "refreshing and easy on the budget",
    ingredients: ["mint", "yuzu", "lime", "sparkling water"],
  },
  {
    id: 13,
    name: "Smash Pepper Burger",
    restaurant: "Stacked & Sauced",
    cuisine: "Continental",
    category: "Burgers",
    price: 249,
    rating: 4.5,
    time: 23,
    healthy: false,
    veg: false,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85",
    match: 86,
    reason: "fast, punchy, and satisfying",
    ingredients: ["beef", "pepper", "bun", "cheese"],
  },
  {
    id: 14,
    name: "Avocado Toast Brunch",
    restaurant: "Nourish Lab",
    cuisine: "Continental",
    category: "Healthy",
    price: 259,
    rating: 4.7,
    time: 19,
    healthy: true,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?auto=format&fit=crop&w=900&q=85",
    match: 89,
    reason: "healthy and perfect for a slow morning",
    ingredients: ["avocado", "bread", "tomato", "lemon"],
  },
  {
    id: 15,
    name: "Hyderabadi Chicken Biryani",
    restaurant: "Dum House",
    cuisine: "Indian",
    category: "Biryani",
    price: 299,
    rating: 4.7,
    time: 35,
    healthy: false,
    veg: false,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1631515242808-497c3fbd3972?auto=format&fit=crop&w=900&q=85",
    match: 92,
    reason: "fragrant, spicy, and deeply satisfying",
    ingredients: ["chicken", "basmati", "mint", "saffron"],
  },
  {
    id: 16,
    name: "Paneer Dum Biryani",
    restaurant: "Saffron & Soil",
    cuisine: "Indian",
    category: "Biryani",
    price: 269,
    rating: 4.6,
    time: 28,
    healthy: true,
    veg: true,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1599043513900-ed6fe01d3833?auto=format&fit=crop&w=900&q=85",
    match: 93,
    reason: "vegetarian comfort within your budget",
    ingredients: ["paneer", "rice", "herbs", "ghee"],
  },
  {
    id: 17,
    name: "Pepperoni Fire Pizza",
    restaurant: "The Daily Crumb",
    cuisine: "Italian",
    category: "Pizza",
    price: 379,
    rating: 4.8,
    time: 29,
    healthy: false,
    veg: false,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=900&q=85",
    match: 90,
    reason: "a bold pizza for a spicy mood",
    ingredients: ["pepperoni", "cheese", "tomato", "olive"],
  },
  {
    id: 18,
    name: "Pesto Corn Pizza",
    restaurant: "The Daily Crumb",
    cuisine: "Italian",
    category: "Pizza",
    price: 319,
    rating: 4.6,
    time: 26,
    healthy: true,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=900&q=85",
    match: 87,
    reason: "fresh, bright, and vegetarian",
    ingredients: ["pesto", "corn", "mozzarella", "basil"],
  },
  {
    id: 19,
    name: "Veggie Spring Rolls",
    restaurant: "Wok Theory",
    cuisine: "Chinese",
    category: "Appetizers",
    price: 179,
    rating: 4.4,
    time: 15,
    healthy: true,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=85",
    match: 81,
    reason: "light and crunchy starter",
    ingredients: ["cabbage", "carrot", "spring roll", "soy"],
  },
  {
    id: 20,
    name: "Crispy Fried Calamari",
    restaurant: "Mesa Verde",
    cuisine: "Continental",
    category: "Appetizers",
    price: 249,
    rating: 4.5,
    time: 18,
    healthy: false,
    veg: false,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=900&q=85",
    match: 82,
    reason: "crispy, savory, and crowd-friendly",
    ingredients: ["calamari", "flour", "garlic", "lemon"],
  },
  {
    id: 21,
    name: "Paneer 65",
    restaurant: "South Side Stories",
    cuisine: "South Indian",
    category: "Appetizers",
    price: 219,
    rating: 4.7,
    time: 19,
    healthy: false,
    veg: true,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=900&q=85",
    match: 86,
    reason: "bold, spicy, and highly rated",
    ingredients: ["paneer", "curry leaves", "chili", "ginger"],
  },
  {
    id: 22,
    name: "Classic Veg Burger",
    restaurant: "Stacked & Sauced",
    cuisine: "Continental",
    category: "Burgers",
    price: 199,
    rating: 4.4,
    time: 17,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85",
    match: 83,
    reason: "classic and easy on the wallet",
    ingredients: ["veg patty", "bun", "lettuce", "tomato"],
  },
  {
    id: 23,
    name: "Chicken Tikka Wrap",
    restaurant: "Saffron & Soil",
    cuisine: "Indian",
    category: "Sandwiches",
    price: 239,
    rating: 4.6,
    time: 21,
    healthy: false,
    veg: false,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=900&q=85",
    match: 84,
    reason: "popular grilled wrap with Indian flavor",
    ingredients: ["chicken", "wrap", "onion", "mint"],
  },
  {
    id: 24,
    name: "Alfredo White Pasta",
    restaurant: "The Daily Crumb",
    cuisine: "Italian",
    category: "Pasta",
    price: 289,
    rating: 4.7,
    time: 24,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=900&q=85",
    match: 88,
    reason: "rich, creamy, and comforting",
    ingredients: ["pasta", "cream", "parmesan", "garlic"],
  },
  {
    id: 25,
    name: "Arrabbiata Pasta",
    restaurant: "The Daily Crumb",
    cuisine: "Italian",
    category: "Pasta",
    price: 279,
    rating: 4.6,
    time: 22,
    healthy: true,
    veg: true,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=85",
    match: 85,
    reason: "tangy and spicy for a comfort meal",
    ingredients: ["tomato", "chili", "olive oil", "pasta"],
  },
  {
    id: 26,
    name: "Miso Noodle Bowl",
    restaurant: "Wok Theory",
    cuisine: "Chinese",
    category: "Noodles",
    price: 259,
    rating: 4.5,
    time: 21,
    healthy: true,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=85",
    match: 84,
    reason: "savory and satisfying without being heavy",
    ingredients: ["noodles", "miso", "spinach", "mushroom"],
  },
  {
    id: 27,
    name: "Choco Lava Cake",
    restaurant: "Nourish Lab",
    cuisine: "Continental",
    category: "Desserts",
    price: 169,
    rating: 4.8,
    time: 13,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=85",
    match: 80,
    reason: "a sweet reward after a long day",
    ingredients: ["chocolate", "cake", "cream", "vanilla"],
  },
  {
    id: 28,
    name: "Cold Coffee Shake",
    restaurant: "Nourish Lab",
    cuisine: "Continental",
    category: "Beverages",
    price: 149,
    rating: 4.5,
    time: 12,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=85",
    match: 78,
    reason: "cool, creamy, and easy to pair with desserts",
    ingredients: ["coffee", "milk", "ice cream", "sugar"],
  },
  {
    id: 29,
    name: "Mango Kulfi",
    restaurant: "Saffron & Soil",
    cuisine: "Indian",
    category: "Desserts",
    price: 129,
    rating: 4.7,
    time: 10,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=900&q=85",
    match: 79,
    reason: "cool mango flavor with a rich finish",
    ingredients: ["mango", "milk", "sugar", "nuts"],
  },
  {
    id: 30,
    name: "Tandoori Platter",
    restaurant: "Dum House",
    cuisine: "Indian",
    category: "Appetizers",
    price: 339,
    rating: 4.8,
    time: 26,
    healthy: true,
    veg: false,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=85",
    match: 88,
    reason: "great for sharing and bold flavor pairing",
    ingredients: ["chicken", "paneer", "tandoori", "herbs"],
  },
  {
    id: 31,
    name: "Veggie Hakka Noodles",
    restaurant: "Wok Theory",
    cuisine: "Chinese",
    category: "Noodles",
    price: 239,
    rating: 4.6,
    time: 22,
    healthy: true,
    veg: true,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=85",
    match: 83,
    reason: "a balanced noodle favorite with vegetables",
    ingredients: ["noodles", "capsicum", "carrot", "soy"],
  },
  {
    id: 32,
    name: "Tandoori Paneer Tikka",
    restaurant: "Saffron & Soil",
    cuisine: "Indian",
    category: "Appetizers",
    price: 249,
    rating: 4.8,
    time: 18,
    healthy: true,
    veg: true,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=900&q=85",
    match: 88,
    reason: "protein-rich and often a favorite order",
    ingredients: ["paneer", "curd", "chili", "tandoor"],
  },
  {
    id: 33,
    name: "Chicken Caesar Wrap",
    restaurant: "Stacked & Sauced",
    cuisine: "Continental",
    category: "Sandwiches",
    price: 259,
    rating: 4.5,
    time: 20,
    healthy: false,
    veg: false,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=900&q=85",
    match: 80,
    reason: "easy, filling, and dependable",
    ingredients: ["chicken", "lettuce", "caesar", "wrap"],
  },
  {
    id: 34,
    name: "Paneer Shawarma",
    restaurant: "Saffron & Soil",
    cuisine: "Indian",
    category: "Rolls",
    price: 199,
    rating: 4.5,
    time: 16,
    healthy: true,
    veg: true,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1617692855027-33b14f061079?auto=format&fit=crop&w=900&q=85",
    match: 82,
    reason: "fresh, handheld, and budget friendly",
    ingredients: ["paneer", "tortilla", "mint", "onion"],
  },
  {
    id: 35,
    name: "Loaded Nachos",
    restaurant: "Mesa Verde",
    cuisine: "Mexican",
    category: "Appetizers",
    price: 219,
    rating: 4.6,
    time: 17,
    healthy: false,
    veg: true,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=900&q=85",
    match: 84,
    reason: "crispy, cheesy, and great for sharing",
    ingredients: ["nachos", "beans", "cheese", "jalapeno"],
  },
  {
    id: 36,
    name: "Veggie Quesadilla",
    restaurant: "Mesa Verde",
    cuisine: "Mexican",
    category: "Appetizers",
    price: 229,
    rating: 4.5,
    time: 18,
    healthy: true,
    veg: true,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1613514785940-daed07799d9b?auto=format&fit=crop&w=900&q=85",
    match: 83,
    reason: "warm, cheesy, and perfect for a light bite",
    ingredients: ["tortilla", "beans", "vegetables", "cheese"],
  },
  {
    id: 37,
    name: "Nutella Crepe",
    restaurant: "Nourish Lab",
    cuisine: "Continental",
    category: "Desserts",
    price: 169,
    rating: 4.6,
    time: 14,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1631358493371-f2843311d2a7?auto=format&fit=crop&w=900&q=85",
    match: 78,
    reason: "sweet and indulgent on a quick order",
    ingredients: ["crepe", "nutella", "banana", "cream"],
  },
  {
    id: 38,
    name: "Lemon Mint Cooler",
    restaurant: "Nourish Lab",
    cuisine: "Continental",
    category: "Beverages",
    price: 119,
    rating: 4.3,
    time: 10,
    healthy: true,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=900&q=85",
    match: 77,
    reason: "simple, zesty, and refreshing",
    ingredients: ["lemon", "mint", "water", "ice"],
  },
  {
    id: 39,
    name: "Saffron Falooda",
    restaurant: "Saffron & Soil",
    cuisine: "Indian",
    category: "Desserts",
    price: 159,
    rating: 4.7,
    time: 12,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=900&q=85",
    match: 81,
    reason: "a cooling dessert with rich texture",
    ingredients: ["milk", "rose", "falooda", "saffron"],
  },
  {
    id: 40,
    name: "Ghee Roast Dosa",
    restaurant: "South Side Stories",
    cuisine: "South Indian",
    category: "South Indian",
    price: 189,
    rating: 4.6,
    time: 19,
    healthy: true,
    veg: true,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1679484898876-414a8388ecb7?auto=format&fit=crop&w=900&q=85",
    match: 86,
    reason: "comforting, aromatic, and deeply satisfying",
    ingredients: ["dosa", "ghee", "chutney", "sambar"],
  },
  {
    id: 41,
    name: "Chicken Burger Deluxe",
    restaurant: "Stacked & Sauced",
    cuisine: "Continental",
    category: "Burgers",
    price: 269,
    rating: 4.7,
    time: 24,
    healthy: false,
    veg: false,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&w=900&q=85",
    match: 86,
    reason: "generous, juicy, and popular with burger lovers",
    ingredients: ["chicken", "bun", "lettuce", "cheese"],
  },
  {
    id: 42,
    name: "Veggie Supreme Pizza",
    restaurant: "The Daily Crumb",
    cuisine: "Italian",
    category: "Pizza",
    price: 329,
    rating: 4.7,
    time: 27,
    healthy: true,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=85",
    match: 89,
    reason: "rich toppings and a balanced veggie profile",
    ingredients: ["veg", "mozzarella", "tomato", "olive"],
  },
  {
    id: 43,
    name: "Spicy Garlic Noodles",
    restaurant: "Wok Theory",
    cuisine: "Chinese",
    category: "Noodles",
    price: 249,
    rating: 4.6,
    time: 23,
    healthy: false,
    veg: true,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=900&q=85",
    match: 88,
    reason: "garlicky heat with strong flavor appeal",
    ingredients: ["noodles", "garlic", "chili", "scallion"],
  },
  {
    id: 44,
    name: "Paneer Tikka Masala",
    restaurant: "Dum House",
    cuisine: "Indian",
    category: "North Indian",
    price: 279,
    rating: 4.7,
    time: 25,
    healthy: true,
    veg: true,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1643222012740-c4ee8f61e3f9?auto=format&fit=crop&w=900&q=85",
    match: 90,
    reason: "classic paneer comfort with rich gravy",
    ingredients: ["paneer", "tomato", "cream", "spices"],
  },
  {
    id: 45,
    name: "Dal Makhani",
    restaurant: "Saffron & Soil",
    cuisine: "Indian",
    category: "North Indian",
    price: 219,
    rating: 4.5,
    time: 23,
    healthy: true,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1604908556855-c1f5d4af9d1a?auto=format&fit=crop&w=900&q=85",
    match: 82,
    reason: "slow-cooked and comforting for a cozy meal",
    ingredients: ["lentils", "butter", "cream", "tomato"],
  },
  {
    id: 46,
    name: "Veg Cheese Sandwich",
    restaurant: "Nourish Lab",
    cuisine: "Continental",
    category: "Sandwiches",
    price: 179,
    rating: 4.4,
    time: 14,
    healthy: true,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=85",
    match: 79,
    reason: "simple, filling, and convenient",
    ingredients: ["bread", "cheese", "lettuce", "tomato"],
  },
  {
    id: 47,
    name: "Chocolate Brownie",
    restaurant: "Nourish Lab",
    cuisine: "Continental",
    category: "Desserts",
    price: 149,
    rating: 4.7,
    time: 10,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=85",
    match: 80,
    reason: "classic sweet finish for a light treat",
    ingredients: ["chocolate", "flour", "butter", "sugar"],
  },
  {
    id: 48,
    name: "Strawberry Ice Cream",
    restaurant: "Cream & Crumb",
    cuisine: "Continental",
    category: "Ice Cream",
    price: 129,
    rating: 4.6,
    time: 9,
    healthy: false,
    veg: true,
    spice: "Mild",
    image: "https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=900&q=85",
    match: 76,
    reason: "cool and comforting dessert pick",
    ingredients: ["strawberry", "cream", "milk", "sugar"],
  },
  {
    id: 49,
    name: "Hot & Sour Soup",
    restaurant: "Wok Theory",
    cuisine: "Chinese",
    category: "Appetizers",
    price: 169,
    rating: 4.4,
    time: 13,
    healthy: true,
    veg: true,
    spice: "Spicy",
    image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85",
    match: 79,
    reason: "warm, balanced, and flavor-packed",
    ingredients: ["broth", "tofu", "chili", "ginger"],
  },
  {
    id: 50,
    name: "Crispy Veg Cutlet",
    restaurant: "South Side Stories",
    cuisine: "South Indian",
    category: "Appetizers",
    price: 149,
    rating: 4.5,
    time: 15,
    healthy: false,
    veg: true,
    spice: "Medium",
    image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=85",
    match: 80,
    reason: "crispy snack with a nostalgic bite",
    ingredients: ["potato", "peas", "spices", "crumb"],
  },
];
const bundledCategories = [
  { name: "Appetizers", icon: "🥗", color: "mint" },
  { name: "Biryani", icon: "🍚", color: "coral" },
  { name: "Pizza", icon: "🍕", color: "gold" },
  { name: "Burgers", icon: "🍔", color: "peach" },
  { name: "Pasta", icon: "🍝", color: "blue" },
  { name: "Healthy", icon: "🥬", color: "mint" },
  { name: "Desserts", icon: "🍰", color: "lilac" },
  { name: "Beverages", icon: "🧃", color: "peach" },
  { name: "Chinese", icon: "🥢", color: "blue" },
  { name: "South Indian", icon: "🥞", color: "gold" },
  { name: "North Indian", icon: "🫓", color: "coral" },
  { name: "Mexican", icon: "🌮", color: "gold" },
  { name: "Italian", icon: "🍝", color: "blue" },
  { name: "Sandwiches", icon: "🥪", color: "peach" },
  { name: "Noodles", icon: "🍜", color: "blue" },
  { name: "Rolls", icon: "🌯", color: "coral" },
  { name: "Ice Cream", icon: "🍦", color: "lilac" },
];
const bundledRestaurants: Restaurant[] = [
  {
    id: 1,
    name: "Saffron & Soil",
    cuisine: "Indian · Healthy",
    rating: 4.8,
    delivery: 24,
    fee: 0,
    distance: "1.2 km",
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=85",
    description: "Ingredient-led Indian comfort food with bright, thoughtful plates.",
  },
  {
    id: 2,
    name: "Wok Theory",
    cuisine: "Chinese · Asian",
    rating: 4.7,
    delivery: 31,
    fee: 29,
    distance: "2.4 km",
    image: "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=85",
    description: "High-heat wok dishes, house sauces, and seriously good crunch.",
  },
  {
    id: 3,
    name: "Nourish Lab",
    cuisine: "Continental · Healthy",
    rating: 4.9,
    delivery: 18,
    fee: 0,
    distance: "0.8 km",
    image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=85",
    description: "Fresh bowls, cloud-like desserts, and easy weekday nourishment.",
  },
  {
    id: 4,
    name: "The Daily Crumb",
    cuisine: "Italian · Pizza",
    rating: 4.6,
    delivery: 27,
    fee: 19,
    distance: "2.1 km",
    image: "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=85",
    description: "Italian classics, sharing platters, and an easy-going neighborhood vibe.",
  },
  {
    id: 5,
    name: "Dum House",
    cuisine: "Indian · Biryani",
    rating: 4.8,
    delivery: 33,
    fee: 0,
    distance: "3.1 km",
    image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=85",
    description: "Traditional biryanis, grills, and rich North Indian comfort dishes.",
  },
  {
    id: 6,
    name: "Mesa Verde",
    cuisine: "Mexican · Street Food",
    rating: 4.5,
    delivery: 22,
    fee: 15,
    distance: "1.7 km",
    image: "https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=900&q=85",
    description: "Bold fillings, fresh salsas, and lively tacos for every mood.",
  },
  {
    id: 7,
    name: "South Side Stories",
    cuisine: "South Indian · Snacks",
    rating: 4.6,
    delivery: 19,
    fee: 0,
    distance: "1.5 km",
    image: "https://images.unsplash.com/photo-1604908556855-c1f5d4af9d1a?auto=format&fit=crop&w=900&q=85",
    description: "Comforting dosas, fiery starters, and warm flavors from the south.",
  },
  {
    id: 8,
    name: "Stacked & Sauced",
    cuisine: "Burgers · Wraps",
    rating: 4.7,
    delivery: 25,
    fee: 20,
    distance: "2.8 km",
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=85",
    description: "Stacked burgers, crisp sides, and all-day comfort picks.",
  },
  {
    id: 9,
    name: "Cream & Crumb",
    cuisine: "Desserts · Beverages",
    rating: 4.6,
    delivery: 16,
    fee: 0,
    distance: "1.0 km",
    image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=85",
    description: "Delightful desserts, shakes, and sweet endings for every craving.",
  },
];
const knownLocations = [
  "Ahmedabad",
  "Bengaluru",
  "Bangalore",
  "Bhopal",
  "Bhubaneswar",
  "Chandigarh",
  "Chennai",
  "Coimbatore",
  "Delhi",
  "Dehradun",
  "Gandhinagar",
  "Goa",
  "Gurugram",
  "Gurgaon",
  "Guwahati",
  "Hyderabad",
  "Indore",
  "Jaipur",
  "Jammu",
  "Kanpur",
  "Kochi",
  "Kolkata",
  "Lucknow",
  "Mumbai",
  "Mysuru",
  "Nagpur",
  "Nashik",
  "Noida",
  "Patna",
  "Pune",
  "Rajkot",
  "Ranchi",
  "Surat",
  "Thane",
  "Thiruvananthapuram",
  "Udaipur",
  "Vadodara",
  "Varanasi",
  "Visakhapatnam",
  "Andhra Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Indiranagar",
  "Koramangala",
  "Whitefield",
  "HSR Layout",
  "Andheri",
  "Bandra",
  "Kondapur",
  "Salt Lake",
  "Viman Nagar",
];

function App() {
  const route = useLocation();
  const navigate = useNavigate();
  const [foods, setFoods] = useState<Food[]>(bundledFoods);
  const [restaurants, setRestaurants] = useState<Restaurant[]>(bundledRestaurants);
  const [categories, setCategories] = useState(bundledCategories);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [vegOnly, setVegOnly] = useState(false);
  const [healthyOnly, setHealthyOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxDelivery, setMaxDelivery] = useState(60);
  const [cuisineFilter, setCuisineFilter] = useState("All");
  const [sortMode, setSortMode] = useState("AI Match");
  const [showPreferences, setShowPreferences] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showAuth, setShowAuth] = useState(() => {
    try {
      return !JSON.parse(localStorage.getItem("ff-account") || "null")?.token;
    } catch {
      return true;
    }
  });
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [location, setLocation] = useState(
    () => localStorage.getItem("ff-location") || "Indiranagar",
  );
  const [locationDraft, setLocationDraft] = useState(
    () => localStorage.getItem("ff-location") || "Indiranagar",
  );
  const [locationError, setLocationError] = useState("");
  const [account, setAccount] = useState<Account | null>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ff-account") || "null");
      return stored?.token ? stored : null;
    } catch {
      return null;
    }
  });
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState("Cash on delivery");
  const [checkoutName, setCheckoutName] = useState("");
  const [checkoutAddress, setCheckoutAddress] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [authError, setAuthError] = useState("");
  const [backendNotice, setBackendNotice] = useState("");
  const [loadedAccountToken, setLoadedAccountToken] = useState<string | null>(null);
  const accountDataLoaded = Boolean(account?.token && loadedAccountToken === account.token);
  const [serverRecommendations, setServerRecommendations] = useState<ApiRecommendation[]>([]);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] =
    useState<Restaurant | null>(null);
  const [compareFoods, setCompareFoods] = useState<Food[]>([]);
  const [trackingStage, setTrackingStage] = useState(1);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewedOrderIds, setReviewedOrderIds] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem("ff-reviewed-orders") || "[]"),
  );
  const [preferences, setPreferences] = useState<Preferences>(() => ({
    ...defaultPreferences,
    ...JSON.parse(localStorage.getItem("ff-preferences") || "{}"),
  }));
  const [favorites, setFavorites] = useState<number[]>(() =>
    JSON.parse(localStorage.getItem("ff-favorites") || "[]"),
  );
  const [restaurantFavorites, setRestaurantFavorites] = useState<number[]>(() =>
    JSON.parse(localStorage.getItem("ff-restaurant-favorites") || "[]"),
  );
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<number[]>(() =>
    JSON.parse(localStorage.getItem("ff-recently-viewed") || "[]"),
  );
  const [cart, setCart] = useState<CartItem[]>(() => {
    const stored = JSON.parse(localStorage.getItem("ff-cart") || "[]") as Array<
      number | CartItem
    >;
    return stored.map((item) =>
      typeof item === "number" ? { id: item, quantity: 1 } : item,
    );
  });
  const [orders, setOrders] = useState<Order[]>(() =>
    JSON.parse(localStorage.getItem("ff-orders") || "[]"),
  );
  const [compareRestaurantIds, setCompareRestaurantIds] = useState<number[]>([
    1, 2,
  ]);
  useEffect(() => {
    let active = true;
    Promise.all([loadCatalogFoods(), loadCatalogRestaurants(), loadCatalogCategories()])
      .then(([catalogFoods, catalogRestaurants, catalogCategories]) => {
        if (!active) return;
        setFoods(catalogFoods.map((food) => {
          const bundled = bundledFoods.find((item) => item.id === food.id);
          return {
            ...bundled,
            ...food,
            image: food.image || bundled?.image || defaultFoodImage,
            meal: food.meal || bundled?.meal,
            ingredients: food.ingredients.length ? food.ingredients : bundled?.ingredients || [],
            match: bundled?.match || 65,
            reason: bundled?.reason || "From the FoodFusion catalogue",
          };
        }));
        setRestaurants(catalogRestaurants.map((restaurant) => {
          const bundled = bundledRestaurants.find((item) => item.id === restaurant.id);
          return {
            ...bundled,
            ...restaurant,
            image: restaurant.image || bundled?.image || defaultRestaurantImage,
          };
        }));
        setCategories(catalogCategories.map((category) => {
          const bundled = bundledCategories.find((item) => item.name === category.name);
          return {
            name: category.name,
            icon: bundled?.icon || "🍽️",
            color: bundled?.color || "peach",
          };
        }));
      })
      .catch(() => {
        if (!active) return;
        setFoods(bundledFoods);
        setRestaurants(bundledRestaurants);
        setCategories(bundledCategories);
      });
    return () => { active = false; };
  }, []);
  useEffect(
    () => localStorage.setItem("ff-favorites", JSON.stringify(favorites)),
    [favorites],
  );
  useEffect(
    () => localStorage.setItem("ff-cart", JSON.stringify(cart)),
    [cart],
  );
  useEffect(
    () => localStorage.setItem("ff-orders", JSON.stringify(orders)),
    [orders],
  );
  useEffect(
    () => localStorage.setItem("ff-reviewed-orders", JSON.stringify(reviewedOrderIds)),
    [reviewedOrderIds],
  );
  useEffect(
    () =>
      localStorage.setItem(
        "ff-restaurant-favorites",
        JSON.stringify(restaurantFavorites),
      ),
    [restaurantFavorites],
  );
  useEffect(
    () => localStorage.setItem("ff-recently-viewed", JSON.stringify(recentlyViewedIds)),
    [recentlyViewedIds],
  );
  useEffect(() => localStorage.setItem("ff-location", location), [location]);
  useEffect(
    () =>
      account
        ? localStorage.setItem("ff-account", JSON.stringify(account))
        : localStorage.removeItem("ff-account"),
    [account],
  );
  useEffect(() => {
    if (!account?.token) return;
    let active = true;
    void getSession(account.token)
      .then((response) => {
        if (active && !response.ok) {
          setAccount(null);
          setShowAuth(true);
        }
      })
      .catch(() => {
        if (active) {
          setAccount(null);
          setShowAuth(true);
        }
      });
    return () => { active = false; };
  }, [account?.token]);
  useEffect(() => {
    const handleCheckoutClick = (event: MouseEvent) => {
      if (
        (event.target as HTMLElement).closest(".cart-summary .primary-button")
      ) {
        setShowCart(false);
        setShowCheckout(true);
      }
      if ((event.target as HTMLElement).closest(".insight-band"))
        setCompareFoods(foods.slice(0, 2));
    };
    document.addEventListener("click", handleCheckoutClick);
    return () => document.removeEventListener("click", handleCheckoutClick);
  }, [foods]);
  useEffect(
    () => localStorage.setItem("ff-preferences", JSON.stringify(preferences)),
    [preferences],
  );
  useEffect(() => {
    const accountToken = account?.token;
    if (!accountToken) return;
    let active = true;
    Promise.all([
      loadPreferences(accountToken),
      loadFavorites(accountToken),
      loadCart(accountToken),
      loadOrders(accountToken),
      loadReviews(accountToken),
    ])
      .then(([savedPreferences, savedFavorites, savedCart, savedOrders, savedReviews]) => {
        if (!active) return;
        setPreferences(savedPreferences);
        setFavorites(savedFavorites.filter((favorite) => favorite.item_type === "food").map((favorite) => favorite.item_id));
        setRestaurantFavorites(savedFavorites.filter((favorite) => favorite.item_type === "restaurant").map((favorite) => favorite.item_id));
        setCart(savedCart);
        setOrders(savedOrders.map((order) => ({
          id: order.id,
          items: order.items.map((item) => ({ id: item.id, quantity: item.quantity, name: item.name, price: item.price })),
          total: order.total,
          placedAt: order.created_at,
          estimatedDelivery: Math.max(0, ...order.items.map((item) => restaurants.find((restaurant) => restaurant.name === item.restaurant)?.delivery || 0)),
          address: order.address,
          location: order.location,
          payment: order.payment_method,
          paymentStatus: order.payment_status,
          status: order.status,
          stage: ({ placed: 1, confirmed: 2, preparing: 3, ready_for_pickup: 4, out_for_delivery: 5, delivered: 6, awaiting_payment: 1 } as Record<string, number>)[order.status] || 1,
        })));
        setReviewedOrderIds([...new Set(savedReviews.map((review) => review.order_id))]);
        setBackendNotice("Account profile, saved items, and orders are synced with the backend.");
      })
      .catch((error: unknown) => {
        if (active) setBackendNotice(error instanceof Error ? `Backend sync unavailable: ${error.message}` : "Backend sync unavailable. This session remains local.");
      })
      .finally(() => {
        if (active) setLoadedAccountToken(accountToken);
      });
    return () => { active = false; };
  }, [account?.token, restaurants]);
  useEffect(() => {
    if (!account?.token || !accountDataLoaded) return;
    const timeout = window.setTimeout(() => {
      void saveCart(account.token!, cart).catch((error: unknown) => {
        setBackendNotice(error instanceof Error ? `Cart sync failed: ${error.message}` : "Cart sync failed.");
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [account?.token, accountDataLoaded, cart]);
  useEffect(() => {
    if (!account?.token || !accountDataLoaded) return;
    const timeout = window.setTimeout(() => {
      void savePreferences(account.token!, preferences).catch((error: unknown) => {
        setBackendNotice(error instanceof Error ? `Preference sync failed: ${error.message}` : "Preference sync failed.");
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [account?.token, accountDataLoaded, preferences]);
  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate("/search");
        window.requestAnimationFrame(() =>
          document.getElementById("food-search")?.focus(),
        );
      }
    };
    document.addEventListener("keydown", handleSearchShortcut);
    return () => document.removeEventListener("keydown", handleSearchShortcut);
  }, [navigate]);
  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      void getRecommendations({
        cuisine: preferences.cuisines,
        categories: preferences.categories,
        meal: preferences.meal,
        avoid: preferences.avoid,
        diet: preferences.diet,
        min_budget: preferences.minBudget,
        max_budget: preferences.maxBudget,
        spice: preferences.spice,
        health: preferences.health,
        query,
      }, account?.token)
        .then((recommendations) => {
          if (active) setServerRecommendations(recommendations);
        })
        .catch(() => {
          if (active) setServerRecommendations([]);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [account?.token, preferences, query]);
  useEffect(() => {
    const search = query.trim();
    if (!account?.token || search.length < 2) return;
    const timeout = window.setTimeout(() => {
      void recordBehavior(account.token!, "search", undefined, { query: search }).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [account?.token, query]);
  const viewedFoodId = Number(route.pathname.match(/^\/food\/(\d+)$/)?.[1]) || 0;
  useEffect(() => {
    if (account?.token && viewedFoodId) {
      void recordBehavior(account.token, "view", viewedFoodId).catch(() => undefined);
    }
  }, [account?.token, viewedFoodId]);
  const searchText = query.toLowerCase();
    const queryTerms = useMemo(() => searchText
      .replace(/(?:under|below|less than)\s*₹?\s*\d+|₹\s*\d+|spicy|healthy|vegetarian|vegan|fast|quick|cheap/g, " ")
      .split(/\s+/)
        .filter((term) => term.length > 1 && !["food", "dish", "please", "show", "find"].includes(term)), [searchText]);
    const avoidTerms = useMemo(() => preferences.avoid
    .toLowerCase()
    .split(/[;,]/)
    .map((term) => term.trim())
      .filter(Boolean), [preferences.avoid]);
  const budgetMatch = searchText.match(
    /(?:under|below|less than)\s*₹?\s*(\d+)/,
  );
  const searchBudget = budgetMatch
    ? Number(budgetMatch[1])
    : searchText.includes("cheap")
      ? 300
      : undefined;
  const interpretedSearch = [
    searchBudget ? `under ₹${searchBudget}` : "",
    searchText.includes("healthy") ? "healthy" : "",
    searchText.includes("vegetarian") ? "vegetarian" : "",
    searchText.includes("spicy") ? "spicy" : "",
    searchText.includes("fast") ? "under 25 min" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const visibleFoods = useMemo(
    () =>
      foods
        .filter((food) => {
          const searchableText =
            `${food.name} ${food.restaurant} ${food.cuisine} ${food.category}`.toLowerCase();
            const matchesText = queryTerms.every((term) => searchableText.includes(term));
          const matchesSmartQuery =
            (!searchBudget || food.price <= searchBudget) &&
            (!searchText.includes("healthy") || food.healthy) &&
            (!searchText.includes("vegetarian") || food.veg) &&
              (!searchText.includes("vegan") || food.vegan === true) &&
            (!searchText.includes("spicy") || food.spice === "Spicy") &&
              (!(searchText.includes("fast") || searchText.includes("quick")) || food.time <= 25);
          return (
            matchesText &&
            matchesSmartQuery &&
              food.price >= preferences.minBudget &&
              food.price <= preferences.maxBudget &&
            (preferences.diet === "Everything" ||
              (preferences.diet === "Vegetarian" && food.veg) ||
              (preferences.diet === "Vegan" && food.vegan === true)) &&
              (preferences.health === "Both" ||
                (preferences.health === "Healthy" && food.healthy) ||
                (preferences.health === "Regular" && !food.healthy)) &&
            !food.ingredients?.some((ingredient) =>
              avoidTerms.some((term) => ingredient.toLowerCase().includes(term)),
            ) &&
            (activeCategory === "All" || food.category === activeCategory) &&
            (cuisineFilter === "All" || food.cuisine === cuisineFilter) &&
            food.rating >= minRating &&
            food.time <= maxDelivery &&
            (!vegOnly || food.veg) &&
            (!healthyOnly || food.healthy)
          );
        })
        .map((food) => {
          const localScore = scoreFood(food, preferences);
          const serverScore = serverRecommendations.find((item) => item.id === food.id);
          return serverScore
            ? { ...food, match: serverScore.match, reason: serverScore.reasons[0] || localScore.reason }
            : { ...food, ...localScore };
        })
        .sort((a, b) =>
          sortMode === "Price low"
            ? a.price - b.price
            : sortMode === "Price high"
              ? b.price - a.price
              : sortMode === "Rating"
                ? b.rating - a.rating
                : sortMode === "Fastest"
                  ? a.time - b.time
                  : (() => {
                      const rankA = serverRecommendations.findIndex((item) => item.id === a.id);
                      const rankB = serverRecommendations.findIndex((item) => item.id === b.id);
                      return rankA < 0 || rankB < 0 ? b.match - a.match : rankA - rankB;
                    })(),
        ),
    [
      activeCategory,
      avoidTerms,
      foods,
      healthyOnly,
      preferences,
      queryTerms,
      searchBudget,
      searchText,
      vegOnly,
      cuisineFilter,
      maxDelivery,
      minRating,
      sortMode,
      serverRecommendations,
    ],
  );
  const recentlyViewedFoods = recentlyViewedIds.flatMap((id) => {
    const food = foods.find((item) => item.id === id);
    return food ? [food] : [];
  });
  const activeTrackingOrder = orders.find((order) => order.id === activeOrderId) || orders[0];
  const toggleFavorite = (id: number) => {
    const removing = favorites.includes(id);
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    if (account?.token) {
      void (removing ? removeFavorite(account.token, "food", id) : addFavorite(account.token, "food", id)).catch((error: unknown) => {
        setBackendNotice(error instanceof Error ? `Favorite sync failed: ${error.message}` : "Favorite sync failed.");
      });
    }
  };
  const toggleRestaurantFavorite = (id: number) => {
    const removing = restaurantFavorites.includes(id);
    setRestaurantFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    if (account?.token) {
      void (removing ? removeFavorite(account.token, "restaurant", id) : addFavorite(account.token, "restaurant", id)).catch((error: unknown) => {
        setBackendNotice(error instanceof Error ? `Favorite sync failed: ${error.message}` : "Favorite sync failed.");
      });
    }
  };
  const trackBehavior = (
    eventType: "search" | "recommendation_click" | "add_to_cart",
    itemId?: number,
    payload: Record<string, unknown> = {},
  ) => {
    if (account?.token) void recordBehavior(account.token, eventType, itemId, payload).catch(() => undefined);
  };
  const addToCart = (id: number) => {
    const food = foods.find((item) => item.id === id);
    if (food)
      setPreferences((current) => ({
        ...current,
        cuisines: current.cuisines.includes(food.cuisine)
          ? current.cuisines
          : [...current.cuisines, food.cuisine],
      }));
    setCart((current) =>
      current.some((item) => item.id === id)
        ? current.map((item) =>
            item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
          )
        : [...current, { id, quantity: 1 }],
    );
      trackBehavior("add_to_cart", id);
  };
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce(
    (sum, item) =>
      sum +
      (foods.find((food) => food.id === item.id)?.price || 0) * item.quantity,
    0,
  );
  const deliveryFee = subtotal >= 500 || subtotal === 0 ? 0 : 39;
  const discount = subtotal >= 800 ? Math.round(subtotal * 0.1) : 0;
  const tax = Math.round((subtotal - discount) * 0.05);
  const cartTotal = subtotal + deliveryFee - discount + tax;
  const updateQuantity = (id: number, delta: number) =>
    setCart((current) =>
      current.flatMap((item) =>
        item.id === id
          ? item.quantity + delta > 0
            ? [{ ...item, quantity: item.quantity + delta }]
            : []
          : [item],
      ),
    );
  const selectMood = (category: string) => {
    setQuery("");
    setActiveCategory(category);
    setVegOnly(false);
    setHealthyOnly(false);
    setCuisineFilter("All");
    setMinRating(0);
    setMaxDelivery(60);
    window.requestAnimationFrame(() =>
      document
        .getElementById("saved")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const openFood = (itemId: number) => {
    setRecentlyViewedIds((current) => [itemId, ...current.filter((id) => id !== itemId)].slice(0, 12));
    navigate(`/food/${itemId}`);
  };
  const surpriseMe = () => {
    const categoriesWithItems = categories.filter((category) =>
      foods.some((food) => food.category === category.name),
    );
    const nextCategory =
      categoriesWithItems[
        Math.floor(Math.random() * categoriesWithItems.length)
      ]?.name || "All";
    selectMood(nextCategory);
  };
  const submitAuth = async () => {
    setAuthError("");
    setAuthBusy(true);
    try {
      const isSignup = authMode === "signup";
      const response =
        isSignup
          ? await apiSignup(
              authName || "FoodFusion friend",
              authEmail,
              authPassword,
            )
          : await apiLogin(authEmail, authPassword);
      setAccount({ ...response.user, token: response.access_token });
      setShowAuth(false);
      navigate("/");
      if (isSignup) setShowPreferences(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authentication service unavailable.";
      setAuthError(normalizeAuthError(authMode, message));
    } finally {
      setAuthBusy(false);
    }
  };
  const logout = () => {
    setAccount(null);
    setLoadedAccountToken(null);
    setBackendNotice("");
    setFavorites([]);
    setRestaurantFavorites([]);
    setRecentlyViewedIds([]);
    setCart([]);
    setOrders([]);
    setReviewedOrderIds([]);
    setPreferences(defaultPreferences);
    setShowProfile(false);
    setShowCart(false);
    setShowSaved(false);
    setShowAuth(true);
    setAuthMode("login");
    setAuthEmail("");
    setAuthPassword("");
    setAuthError("");
    setCheckoutError("");
    navigate("/");
  };
  const placeOrder = async () => {
    if (cartCount === 0) return false;
    if (!checkoutName.trim() || !checkoutAddress.trim()) {
      setCheckoutError("Add your name and delivery address to continue.");
      return false;
    }
    if (selectedPayment !== "Cash on delivery") {
      setCheckoutError("Online payment confirmation is not configured. Choose cash on delivery for this demo checkout.");
      return false;
    }
    setCheckoutError("");
    let order: Order;
    if (account?.token) {
      try {
        const savedOrder = await createOrder(account.token, {
          items: cart.map((item) => ({ id: item.id, quantity: item.quantity })),
          address: checkoutAddress.trim(),
          location,
          payment_method: selectedPayment,
        });
        order = {
          id: savedOrder.id,
          items: savedOrder.items.map((item) => ({ id: item.id, quantity: item.quantity, name: item.name, price: item.price, restaurant: item.restaurant })),
          total: savedOrder.total,
          placedAt: savedOrder.created_at,
          estimatedDelivery: Math.max(0, ...savedOrder.items.map((item) => restaurants.find((restaurant) => restaurant.name === item.restaurant)?.delivery || 0)),
          address: savedOrder.address,
          location: savedOrder.location,
          payment: savedOrder.payment_method,
          paymentStatus: savedOrder.payment_status,
          status: savedOrder.status,
          stage: 1,
        };
      } catch (error) {
        setCheckoutError(error instanceof Error ? `Order could not be saved: ${error.message}` : "Order could not be saved. Check your connection and try again.");
        return false;
      }
    } else {
      order = {
        id: `FF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        items: cart.map((item) => ({ ...item })),
        total: cartTotal,
        placedAt: new Date().toISOString(),
        address: checkoutAddress.trim(),
        location,
        payment: selectedPayment,
        stage: 1,
      };
    }
    setOrders((current) => [order, ...current]);
    setActiveOrderId(order.id);
    setCart([]);
    setOrderPlaced(true);
    setTrackingStage(1);
    return true;
  };
  const advanceOrder = async (orderId: string, stage: number) => {
    if (account?.token) {
      try {
        const saved = await updateOrderStage(account.token, orderId, stage);
        const statusByStage = ["placed", "confirmed", "preparing", "ready_for_pickup", "out_for_delivery", "delivered"];
        setOrders((current) => current.map((order) => order.id === orderId
          ? { ...order, stage, status: statusByStage[stage - 1] }
          : order));
        setTrackingStage(stage);
        setOrderPlaced(stage < 6);
        return saved;
      } catch (error) {
        setBackendNotice(error instanceof Error ? `Tracking update failed: ${error.message}` : "Tracking update failed.");
        return;
      }
    }
    setOrders((current) => current.map((order) => order.id === orderId ? { ...order, stage } : order));
    setTrackingStage(stage);
    setOrderPlaced(stage < 6);
  };
  const submitOrderReview = async (order: Order) => {
    if (account?.token) {
      try {
        await Promise.all(order.items.map((item) => createReview(account.token!, {
          order_id: order.id,
          item_id: item.id,
          rating: reviewRating,
          comment: reviewText,
        })));
      } catch (error) {
        setBackendNotice(error instanceof Error ? `Review could not be saved: ${error.message}` : "Review could not be saved.");
        return;
      }
    } else {
      localStorage.setItem("ff-last-review", JSON.stringify({ rating: reviewRating, text: reviewText, order_id: order.id }));
    }
    setReviewedOrderIds((current) => current.includes(order.id) ? current : [...current, order.id]);
    setReviewSubmitted(true);
  };

  if (route.pathname !== "/") {
    const routeTitles: Record<string, string> = {
      "/explore": "Explore everything",
      "/search": "Search the menu",
      "/recommendations": "Picked for your table",
      "/favorites": "Your favorites",
      "/compare": "Compare restaurants",
      "/cart": "Your cart",
      "/checkout": "Delivery details",
      "/orders": "Order history",
      "/profile": "Your profile",
      "/preferences": "Your preferences",
    };
    const foodDetail = route.pathname.match(/^\/food\/(\d+)$/);
    const restaurantDetail = route.pathname.match(/^\/restaurant\/(\d+)$/);
    const selectedFoodRoute = foodDetail
      ? foods.find((food) => food.id === Number(foodDetail[1]))
      : undefined;
    const selectedRestaurantRoute = restaurantDetail
      ? restaurants.find((restaurant) => restaurant.id === Number(restaurantDetail[1]))
      : undefined;
    const catalogRoute = ["/explore", "/search", "/recommendations"].includes(
      route.pathname,
    );
    const comparedRestaurants = restaurants.filter((restaurant) =>
      compareRestaurantIds.includes(restaurant.id),
    );
    return (
      <main className="route-page">
        <nav className="navbar">
          <Link className="brand" to="/">
            <span className="brand-mark">
              <Sparkles size={16} />
            </span>
            <span>
              food<span>fusion</span>
            </span>
          </Link>
          <div className={`route-nav ${menuOpen ? "open" : ""}`}>
            <Link to="/">Home</Link>
            <Link to="/explore">Explore</Link>
            <Link to="/recommendations">For you</Link>
            <Link to="/favorites">Favorites</Link>
            <Link to="/orders">Orders</Link>
            <Link to="/profile">Profile</Link>
          </div>
          <button className="cart-button" onClick={() => navigate("/cart")}>
            <ShoppingBag size={19} />
            <span>{cartCount}</span>
          </button>
        </nav>
        {backendNotice && <div className="backend-notice" role="status">{backendNotice}</div>}
        <section className="route-content">
          <div className="eyebrow orange">
            <Sparkles size={14} /> FoodFusion workspace
          </div>
          <h1>
            {selectedFoodRoute?.name ||
              selectedRestaurantRoute?.name ||
              routeTitles[route.pathname] ||
              "Page not found"}
          </h1>
          {catalogRoute && (
            <>
              <p className="route-lead">
                {route.pathname === "/recommendations"
                  ? "A live shortlist ranked against your diet, cuisine, budget, and pace."
                  : "Find the right dish with searchable menus and useful, honest filters."}
              </p>
              <div className="route-catalog-tools">
                <label className="search-box route-search-box">
                  <Search size={18} />
                  <input
                    id="food-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Dish, cuisine, or restaurant"
                    aria-label="Search dishes"
                  />
                </label>
                <div className="route-filter-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={vegOnly}
                      onChange={(event) => setVegOnly(event.target.checked)}
                    />
                    Vegetarian
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={healthyOnly}
                      onChange={(event) => setHealthyOnly(event.target.checked)}
                    />
                    Healthy
                  </label>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value)}
                    aria-label="Sort dishes"
                  >
                    <option>AI Match</option>
                    <option>Rating</option>
                    <option>Fastest</option>
                    <option>Price low</option>
                    <option>Price high</option>
                  </select>
                </div>
              </div>
              {preferences.avoid && (
                <p className="catalog-notice">
                  Dishes with listed ingredients matching “{preferences.avoid}” are hidden. Ingredient data is incomplete; verify allergens with the restaurant.
                </p>
              )}
              <div className="route-catalog-grid">
                {visibleFoods.map((food) => (
                  <FoodCard
                    key={food.id}
                    food={food}
                    favorite={favorites.includes(food.id)}
                    inCart={cart.some((item) => item.id === food.id)}
                    onFavorite={() => toggleFavorite(food.id)}
                    onAdd={() => addToCart(food.id)}
                    onSelect={() => openFood(food.id)}
                  />
                ))}
              </div>
              {!visibleFoods.length && (
                <div className="empty-results">
                  <h3>{preferences.diet === "Vegan" ? "No verified vegan dishes yet." : "No dishes fit these filters."}</h3>
                  <p>{preferences.diet === "Vegan" ? "We do not have verified vegan ingredient data for this menu. Choose another diet preference or check with the restaurant." : "Try broadening your search or adjusting your preferences."}</p>
                  <button
                    className="reset-results"
                    onClick={() => {
                      setQuery("");
                      setActiveCategory("All");
                      setVegOnly(false);
                      setHealthyOnly(false);
                      setCuisineFilter("All");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </>
          )}
          {foodDetail && selectedFoodRoute && (
            <section className="route-detail-layout">
              <img src={selectedFoodRoute.image} alt={selectedFoodRoute.name} />
              <div className="route-detail-copy">
                <div className="eyebrow orange"><Sparkles size={14} /> {scoreFood(selectedFoodRoute, preferences).match}% preference match</div>
                <p className="route-lead">{selectedFoodRoute.restaurant} · {selectedFoodRoute.cuisine}</p>
                <p>{selectedFoodRoute.reason}. Menu information is provided for discovery; confirm dietary and allergen requirements directly with the restaurant.</p>
                <div className="detail-meta"><span>₹{selectedFoodRoute.price}</span><span><Star size={14} fill="currentColor" /> {selectedFoodRoute.rating}</span><span><Clock3 size={14} /> {selectedFoodRoute.time} min</span></div>
                <button className="primary-button" onClick={() => { addToCart(selectedFoodRoute.id); navigate("/cart"); }}>Add to bag <Plus size={17} /></button>
              </div>
            </section>
          )}
          {restaurantDetail && selectedRestaurantRoute && (
            <>
              <section className="route-detail-layout">
                <img src={selectedRestaurantRoute.image} alt={selectedRestaurantRoute.name} />
                <div className="route-detail-copy">
                  <div className="eyebrow orange"><MapPin size={14} /> Restaurant · {selectedRestaurantRoute.distance}</div>
                  <p className="route-lead">{selectedRestaurantRoute.cuisine}</p>
                  <p>{selectedRestaurantRoute.description}</p>
                  <div className="detail-meta"><span><Star size={14} fill="currentColor" /> {selectedRestaurantRoute.rating}</span><span><Clock3 size={14} /> {selectedRestaurantRoute.delivery} min</span><span>{selectedRestaurantRoute.fee ? `₹${selectedRestaurantRoute.fee} delivery` : "Free delivery"}</span></div>
                </div>
              </section>
              <section className="restaurant-route-menu">
                <div className="section-heading"><div><div className="eyebrow orange">{selectedRestaurantRoute.menu_count || foods.filter((food) => food.restaurant === selectedRestaurantRoute.name).length} dishes</div><h2>Menu</h2></div></div>
                <div className="route-list">
                  {foods.filter((food) => food.restaurant === selectedRestaurantRoute.name).map((food) => (
                    <div className="route-row" key={food.id}>
                      <img src={food.image} alt={food.name} />
                      <span><strong>{food.name}</strong><small>{food.category} · ₹{food.price} · {food.time} min</small></span>
                      <button className="icon-button" aria-label={`Add ${food.name} to cart`} onClick={() => addToCart(food.id)}><Plus size={17} /></button>
                      <button className="text-button" onClick={() => openFood(food.id)}>Details</button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          {route.pathname === "/favorites" && (
            <div className="route-list">
              {favorites.map((id) => {
                const food = foods.find((item) => item.id === id);
                return (
                  food && (
                    <div className="route-row" key={id}>
                      <img src={food.image} alt="" />
                      <span>
                        <strong>{food.name}</strong>
                        <small>
                          {food.restaurant} · ₹{food.price}
                        </small>
                      </span>
                      <button
                        className="text-button"
                        onClick={() => toggleFavorite(id)}
                      >
                        Remove
                      </button>
                    </div>
                  )
                );
              })}
              {restaurantFavorites.map((id) => {
                const restaurant = restaurants.find((item) => item.id === id);
                return (
                  restaurant && (
                    <div className="route-row" key={`restaurant-${id}`}>
                      <img src={restaurant.image} alt="" />
                      <span>
                        <strong>{restaurant.name}</strong>
                        <small>{restaurant.cuisine}</small>
                      </span>
                      <button
                        className="text-button"
                        onClick={() => toggleRestaurantFavorite(id)}
                      >
                        Remove
                      </button>
                    </div>
                  )
                );
              })}
              {!favorites.length && !restaurantFavorites.length && (
                <p className="empty-copy">No favorites yet.</p>
              )}
            </div>
          )}
          {route.pathname === "/compare" && (
            <div className="comparison-workspace">
              <p className="route-lead">
                Select up to three nearby kitchens and compare the details that matter.
              </p>
              <div className="compare-select-list">
                {restaurants.map((restaurant) => (
                  <button
                    key={restaurant.id}
                    className={compareRestaurantIds.includes(restaurant.id) ? "selected" : ""}
                    aria-pressed={compareRestaurantIds.includes(restaurant.id)}
                    onClick={() =>
                      setCompareRestaurantIds((current) =>
                        current.includes(restaurant.id)
                          ? current.filter((id) => id !== restaurant.id)
                          : current.length < 3
                            ? [...current, restaurant.id]
                            : current,
                      )
                    }
                  >
                    {restaurant.name}
                  </button>
                ))}
              </div>
              {comparedRestaurants.length > 0 ? (
                <div className="comparison-table-wrap">
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th scope="col">Details</th>
                        {comparedRestaurants.map((restaurant) => (
                          <th scope="col" key={restaurant.id}>
                            {restaurant.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">Cuisine</th>
                        {comparedRestaurants.map((restaurant) => <td key={restaurant.id}>{restaurant.cuisine}</td>)}
                      </tr>
                      <tr>
                        <th scope="row">Rating</th>
                        {comparedRestaurants.map((restaurant) => <td key={restaurant.id}><Star size={13} fill="currentColor" /> {restaurant.rating}</td>)}
                      </tr>
                      <tr>
                        <th scope="row">Delivery time</th>
                        {comparedRestaurants.map((restaurant) => <td key={restaurant.id}>{restaurant.delivery} min</td>)}
                      </tr>
                      <tr>
                        <th scope="row">Distance</th>
                        {comparedRestaurants.map((restaurant) => <td key={restaurant.id}>{restaurant.distance}</td>)}
                      </tr>
                      <tr>
                        <th scope="row">Delivery fee</th>
                        {comparedRestaurants.map((restaurant) => <td key={restaurant.id}>{restaurant.fee ? `₹${restaurant.fee}` : "Free"}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-results"><h3>Select a restaurant to compare.</h3></div>
              )}
            </div>
          )}
          {route.pathname === "/cart" && (
            cart.length ? (
              <div className="route-cart-layout">
                <div className="route-cart-items">
                  {cart.map((item) => {
                    const food = foods.find((entry) => entry.id === item.id)!;
                    return (
                      <article className="route-cart-item" key={item.id}>
                        <img src={food.image} alt={food.name} />
                        <div className="route-cart-item-copy">
                          <strong>{food.name}</strong>
                          <span>{food.restaurant} · ₹{food.price}</span>
                        </div>
                        <div className="quantity-control">
                          <button aria-label={`Remove one ${food.name}`} onClick={() => updateQuantity(item.id, -1)}>−</button>
                          <span>{item.quantity}</span>
                          <button aria-label={`Add one ${food.name}`} onClick={() => updateQuantity(item.id, 1)}>+</button>
                        </div>
                        <b>₹{food.price * item.quantity}</b>
                      </article>
                    );
                  })}
                </div>
                <aside className="route-cart-summary">
                  <h2>Order summary</h2>
                  <div><span>Subtotal</span><strong>₹{subtotal}</strong></div>
                  <div><span>Delivery</span><strong>{deliveryFee ? `₹${deliveryFee}` : "Free"}</strong></div>
                  <div><span>Discount</span><strong>−₹{discount}</strong></div>
                  <div><span>Tax</span><strong>₹{tax}</strong></div>
                  <div className="route-cart-total"><span>Total</span><strong>₹{cartTotal}</strong></div>
                  <button className="primary-button full" onClick={() => navigate("/checkout")}>
                    Continue to checkout <ArrowRight size={17} />
                  </button>
                  <Link to="/explore" className="route-back-link">Add more dishes</Link>
                </aside>
              </div>
            ) : (
              <div className="empty-results">
                <ShoppingBag size={30} />
                <h3>Your bag is empty.</h3>
                <p>Find something good for your table.</p>
                <Link className="primary-button route-cta" to="/explore">Explore dishes <ArrowRight size={17} /></Link>
              </div>
            )
          )}
          {route.pathname === "/checkout" && (
            cart.length ? (
              <div className="checkout-route-grid">
                <section className="checkout-route-form">
                  <p className="route-lead">Confirm where to deliver and how you would like to pay.</p>
                  <label htmlFor="checkout-name">Name</label>
                  <input id="checkout-name" className="checkout-input" value={checkoutName} onChange={(event) => { setCheckoutName(event.target.value); setCheckoutError(""); }} placeholder={account?.name || "Your name"} />
                  <label htmlFor="checkout-address">Delivery address · {location}</label>
                  <textarea id="checkout-address" className="checkout-input address-input" value={checkoutAddress} onChange={(event) => { setCheckoutAddress(event.target.value); setCheckoutError(""); }} placeholder="Apartment, street, and landmark" />
                  <span className="checkout-route-label">Payment method</span>
                  <div className="payment-row">
                    {["Cash on delivery", "UPI", "Card"].map((method) => (
                      <button key={method} className={`choice ${selectedPayment === method ? "active" : ""}`} aria-pressed={selectedPayment === method} onClick={() => setSelectedPayment(method)}>{method}</button>
                    ))}
                  </div>
                  {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
                  <button className="primary-button full" onClick={async () => { if (await placeOrder()) navigate("/orders"); }}>
                    Place order · ₹{cartTotal} <ArrowRight size={17} />
                  </button>
                  <p className="checkout-demo-note">Demo checkout: external payment is only enabled when the backend is configured.</p>
                </section>
                <aside className="route-cart-summary checkout-order-summary">
                  <h2>Your order</h2>
                  {cart.map((item) => {
                    const food = foods.find((entry) => entry.id === item.id)!;
                    return <div key={item.id}><span>{item.quantity} × {food.name}</span><strong>₹{food.price * item.quantity}</strong></div>;
                  })}
                  <div><span>Delivery</span><strong>{deliveryFee ? `₹${deliveryFee}` : "Free"}</strong></div>
                  <div className="route-cart-total"><span>Total</span><strong>₹{cartTotal}</strong></div>
                </aside>
              </div>
            ) : (
              <div className="empty-results"><h3>There is nothing to check out yet.</h3><Link className="primary-button route-cta" to="/explore">Explore dishes <ArrowRight size={17} /></Link></div>
            )
          )}
          {route.pathname === "/orders" && (
            orders.length ? (
              <div className="order-history-list">
                {orders.map((order) => (
                  <article className="order-history-card" key={order.id}>
                    <div className="order-history-heading">
                      <div><div className="eyebrow orange">{order.id}</div><h2>{new Date(order.placedAt).toLocaleString()}</h2></div>
                      <strong>₹{order.total}</strong>
                    </div>
                    <p>{order.items.map((item) => `${item.quantity} × ${item.name || foods.find((food) => food.id === item.id)?.name || "Dish"}`).join(" · ")}</p>
                    <p className="order-delivery-details">Restaurant: {[...new Set(order.items.map((item) => item.restaurant || foods.find((food) => food.id === item.id)?.restaurant).filter(Boolean))].join(", ")} · Estimated delivery {order.estimatedDelivery || 35} min</p>
                    <p className="order-delivery-details">{order.address} · {order.location} · {order.payment}</p>
                    <div className="tracking-line route-tracking-line">
                      {ORDER_STAGES.map((stage, index) => (
                        <button key={stage} className={index + 1 <= order.stage ? "done" : ""} aria-current={index + 1 === order.stage ? "step" : undefined} disabled={order.paymentStatus === "pending" || index + 1 !== order.stage + 1} onClick={() => void advanceOrder(order.id, index + 1)}>
                          <span>{index + 1 <= order.stage ? "✓" : index + 1}</span>{stage}
                        </button>
                      ))}
                    </div>
                    {order.stage === 6 && !reviewedOrderIds.includes(order.id) && (
                      <div className="review-box route-review-box">
                        <div className="eyebrow orange">Help your next recommendation</div>
                        <h3>How did this order land?</h3>
                        <div className="review-stars">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button key={value} onClick={() => setReviewRating(value)} className={value <= reviewRating ? "active" : ""} aria-label={`${value} star rating`}>★</button>
                          ))}
                        </div>
                        <textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="A note for your next recommendation" />
                        <button className="primary-button" onClick={() => void submitOrderReview(order)}>Save review <ArrowRight size={17} /></button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="order-route-card">
                <h2>No orders yet</h2>
                <p>Your placed orders and delivery progress will appear here.</p>
                <Link className="primary-button" to="/explore">Discover food <ArrowRight size={17} /></Link>
              </div>
            )
          )}
          {route.pathname === "/profile" && (
            <div className="profile-route-card">
              <div className="profile-avatar">
                {account ? account.name.slice(0, 2).toUpperCase() : "AS"}
              </div>
              <h2>{account?.name || "Guest account"}</h2>
              <p>
                {account?.email ||
                  "Log in from the home page to save your profile."}
              </p>
              {account ? (
                <button
                  className="primary-button"
                  onClick={logout}
                >
                  Log out
                </button>
              ) : (
                <Link className="primary-button" to="/">
                  Log in or sign up <ArrowRight size={17} />
                </Link>
              )}
            </div>
          )}
          {route.pathname === "/preferences" && (
            <div className="route-preferences">
              <p>Your taste profile is saved on this device and used to rank eligible dishes.</p>
              <div className="preference-control-grid">
                <label>Diet<select value={preferences.diet} onChange={(event) => setPreferences((current) => ({ ...current, diet: event.target.value as Preferences["diet"] }))}><option>Vegetarian</option><option>Everything</option><option>Vegan</option></select></label>
                <label>Favorite cuisine<select value={preferences.cuisines[0] || "Indian"} onChange={(event) => setPreferences((current) => ({ ...current, cuisines: [event.target.value] }))}><option>Indian</option><option>Chinese</option><option>Italian</option><option>Mexican</option><option>Continental</option></select></label>
                <label>Budget up to ₹{preferences.maxBudget}<input type="range" min="150" max="500" step="10" value={preferences.maxBudget} onChange={(event) => setPreferences((current) => ({ ...current, maxBudget: Number(event.target.value) }))} /></label>
                <label>Spice<select value={preferences.spice} onChange={(event) => setPreferences((current) => ({ ...current, spice: event.target.value as Preferences["spice"] }))}><option>Mild</option><option>Medium</option><option>Spicy</option></select></label>
                <label>Meal<select value={preferences.meal} onChange={(event) => setPreferences((current) => ({ ...current, meal: event.target.value as Preferences["meal"] }))}><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snacks</option></select></label>
                <label>Health<select value={preferences.health} onChange={(event) => setPreferences((current) => ({ ...current, health: event.target.value as Preferences["health"] }))}><option>Healthy</option><option>Regular</option><option>Both</option></select></label>
                <label className="avoid-field">Avoid ingredients<input value={preferences.avoid} onChange={(event) => setPreferences((current) => ({ ...current, avoid: event.target.value }))} placeholder="peanuts, mushrooms" /></label>
              </div>
              <Link className="primary-button route-cta" to="/recommendations">See my recommendations <ArrowRight size={17} /></Link>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input")) return;
        const card = target.closest(".food-card");
        const name = card?.querySelector("h3")?.textContent;
        if (name)
          setSelectedFood(foods.find((food) => food.name === name) || null);
      }}
    >
      <div className="search-interpretation" aria-live="polite">
        {interpretedSearch && (
          <>
            Search interpreted as: <strong>{interpretedSearch}</strong>
          </>
        )}
      </div>
      <nav className="navbar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={16} />
          </span>
          <span>
            food<span>fusion</span>
          </span>
        </div>
        <div className={`nav-links ${menuOpen ? "open" : ""}`}>
          <Link className="active" to="/">
            Home
          </Link>
          <Link to="/explore">Explore</Link>
          <Link to="/recommendations">For you</Link>
          <Link to="/favorites">Saved</Link>
          <Link to="/orders">Orders</Link>
          <Link to="/profile">Profile</Link>
        </div>
        <div className="nav-actions">
          <button className="location" onClick={() => setShowLocation(true)}>
            <MapPin size={15} /> {location} <ChevronDown size={14} />
          </button>
          <button className="icon-button menu-button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <Menu size={21} />
          </button>
          <button
            className="cart-button"
            onClick={() => setShowCart(true)}
            aria-label="Open cart"
          >
            <ShoppingBag size={19} />
            <span>{cartCount}</span>
          </button>
          <button
            className="avatar"
            onClick={() => (account ? setShowProfile(true) : setShowAuth(true))}
          >
            {account ? account.name.slice(0, 2).toUpperCase() : "AS"}
          </button>
        </div>
      </nav>
      {backendNotice && <div className="backend-notice" role="status">{backendNotice}</div>}
      <section className="hero-section" id="discover">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="pulse-dot" /> Your personal food scout
          </div>
          <h1>
            Find food that
            <br />
            <em>fits you.</em>
          </h1>
          <p className="hero-subtitle">
            No endless scrolling. Just thoughtful picks based on your taste,
            your day, and your kind of hungry.
          </p>
          <div className="search-box">
            <Search size={21} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “spicy chicken under ₹300”"
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="hero-meta">
            <button
              onClick={() => setShowPreferences(true)}
              className="primary-button"
            >
              Personalize my picks <ArrowRight size={17} />
            </button>
            <span>
              <Zap size={15} /> Learns as you order
            </span>
          </div>
        </div>
        <div className="hero-art">
          <div className="art-note note-top">
            <Sparkles size={14} />{" "}
            <span>
              <strong>96% match</strong>
              <br />
              picked for your mood
            </span>
          </div>
          <div className="food-orbit orbit-one" />
          <div className="food-orbit orbit-two" />
          <img
            src="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1000&q=85"
            alt="Colorful fresh salad bowl"
          />
          <div className="art-note note-bottom">
            <span className="mini-avatar">✦</span>
            <span>
              Made for <strong>your table</strong>
            </span>
          </div>
        </div>
      </section>
      <section className="category-row">
        <div className="section-kicker">What are you in the mood for?</div>
        <div className="category-list">
          {categories.map((category) => (
            <button
              key={category.name}
              className={`category-pill ${category.color} ${activeCategory === category.name ? "selected" : ""}`}
              onClick={() => selectMood(category.name)}
            >
              <span>{category.icon}</span>
              {category.name}
            </button>
          ))}
        </div>
      </section>
      <section className="signals-panel">
        <div className="signals-copy">
          <div className="eyebrow orange">
            <Sparkles size={14} /> FoodFusion Signals
          </div>
          <h2>Your taste has a shape.</h2>
          <p>
            A living snapshot of what your choices say today. It gets more
            personal every time you save, search, or order.
          </p>
          <button className="primary-button" onClick={surpriseMe}>
            Surprise me <Sparkles size={16} />
          </button>
        </div>
        <div className="signals-orbit" aria-label="Current taste profile">
          <div className="signal-ring ring-outer" />
          <div className="signal-ring ring-inner" />
          <div className="signal-core">
            <span>you</span>
            <strong>{preferences.spice.toLowerCase()}</strong>
          </div>
          <span className="signal-tag tag-one">
            {preferences.cuisines[0] || "Curious"}
          </span>
          <span className="signal-tag tag-two">₹{preferences.maxBudget}</span>
          <span className="signal-tag tag-three">{preferences.health}</span>
          <span className="signal-tag tag-four">{preferences.meal}</span>
        </div>
        <div className="signal-metrics">
          <div>
            <strong>{visibleFoods[0]?.match || 0}%</strong>
            <span>top match</span>
          </div>
          <div>
            <strong>{cartCount}</strong>
            <span>in your bag</span>
          </div>
          <div>
            <strong>{favorites.length}</strong>
            <span>saved sparks</span>
          </div>
        </div>
      </section>
      <section className="restaurant-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow orange">
              <MapPin size={14} /> Around your table
            </div>
            <h2>Restaurants worth knowing.</h2>
            <p>Compare the people behind your next good meal.</p>
          </div>
          <button
            className="text-button"
            onClick={() => setCompareFoods(foods.slice(0, 2))}
          >
            Compare picks <ArrowRight size={16} />
          </button>
        </div>
        <div className="restaurant-grid">
          {restaurants.map((restaurant) => (
            <article
              className="restaurant-card"
              key={restaurant.id}
              onClick={() => setSelectedRestaurant(restaurant)}
            >
              <img src={restaurant.image} alt={restaurant.name} />
              <button
                className={`restaurant-heart ${restaurantFavorites.includes(restaurant.id) ? "liked" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleRestaurantFavorite(restaurant.id);
                }}
                aria-label="Save restaurant"
              >
                <Heart
                  size={16}
                  fill={
                    restaurantFavorites.includes(restaurant.id)
                      ? "currentColor"
                      : "none"
                  }
                />
              </button>
              <div>
                <div className="restaurant-title">
                  <h3>{restaurant.name}</h3>
                  <span>
                    <Star size={12} fill="currentColor" /> {restaurant.rating}
                  </span>
                </div>
                <p>{restaurant.cuisine}</p>
                <small>
                  {restaurant.delivery} min · {restaurant.distance} ·{" "}
                  {restaurant.fee
                    ? `₹${restaurant.fee} delivery`
                    : "Free delivery"}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="preference-controls">
        <div>
          <div className="eyebrow orange">
            <Sparkles size={14} /> Your taste profile
          </div>
          <h2>Fine-tune your table.</h2>
        </div>
        <div className="preference-control-grid">
          <label>
            Diet
            <select
              value={preferences.diet}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  diet: event.target.value as Preferences["diet"],
                }))
              }
            >
              <option>Vegetarian</option>
              <option>Everything</option>
              <option>Vegan</option>
            </select>
          </label>
          <label>
            Favorite cuisine
            <select
              value={preferences.cuisines[0] || "Indian"}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  cuisines: [event.target.value],
                }))
              }
            >
              <option>Indian</option>
              <option>Chinese</option>
              <option>Italian</option>
              <option>Mexican</option>
              <option>Continental</option>
            </select>
          </label>
          <label>
            Budget up to ₹{preferences.maxBudget}
            <input
              type="range"
              min="150"
              max="500"
              step="10"
              value={preferences.maxBudget}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  maxBudget: Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            Spice
            <select
              value={preferences.spice}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  spice: event.target.value as Preferences["spice"],
                }))
              }
            >
              <option>Mild</option>
              <option>Medium</option>
              <option>Spicy</option>
            </select>
          </label>
          <label>
            Meal
            <select
              value={preferences.meal}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  meal: event.target.value as Preferences["meal"],
                }))
              }
            >
              <option>Breakfast</option>
              <option>Lunch</option>
              <option>Dinner</option>
              <option>Snacks</option>
            </select>
          </label>
          <label>
            Health
            <select
              value={preferences.health}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  health: event.target.value as Preferences["health"],
                }))
              }
            >
              <option>Healthy</option>
              <option>Regular</option>
              <option>Both</option>
            </select>
          </label>
          <label className="avoid-field">
            Avoid ingredients
            <input
              value={preferences.avoid}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  avoid: event.target.value,
                }))
              }
              placeholder="peanuts, mushrooms..."
            />
          </label>
        </div>
      </section>
      <section className="recommendation-section" id="saved">
        <div className="section-heading">
          <div>
            <div className="eyebrow orange">
              <Sparkles size={14} /> Curated by your preferences
            </div>
            <h2>Today’s best matches</h2>
            <p>Recommendations with a reason, not just a rating.</p>
          </div>
          <button
            className="text-button"
            onClick={() => setShowPreferences(true)}
          >
            Tune my taste <SlidersHorizontal size={16} />
          </button>
        </div>
        <div className="filter-bar">
          <div className="result-count">
            {visibleFoods.length} dishes for you
          </div>
          <div className="filters">
            <button
              className={activeCategory === "All" ? "selected" : ""}
              onClick={() => setActiveCategory("All")}
            >
              All
            </button>
            <button
              className={vegOnly ? "selected" : ""}
              onClick={() => setVegOnly(!vegOnly)}
            >
              Vegetarian
            </button>
            <button
              className={healthyOnly ? "selected" : ""}
              onClick={() => setHealthyOnly(!healthyOnly)}
            >
              Healthy
            </button>
            <button>
              <SlidersHorizontal size={14} /> Filters
            </button>
          </div>
        </div>
        {visibleFoods.length < foods.length && (
          <button
            className="reset-results"
            onClick={() => {
              setQuery("");
              setActiveCategory("All");
              setVegOnly(false);
              setHealthyOnly(false);
              setCuisineFilter("All");
              setMinRating(0);
              setMaxDelivery(60);
            }}
          >
            Show all food items
          </button>
        )}
        <div className="advanced-filter-row">
          <label>
            Cuisine
            <select
              value={cuisineFilter}
              onChange={(event) => setCuisineFilter(event.target.value)}
            >
              <option>All</option>
              <option>Indian</option>
              <option>Chinese</option>
              <option>Italian</option>
              <option>Mexican</option>
              <option>Continental</option>
            </select>
          </label>
          <label>
            Rating
            <select
              value={minRating}
              onChange={(event) => setMinRating(Number(event.target.value))}
            >
              <option value="0">Any rating</option>
              <option value="4">4+ stars</option>
              <option value="4.5">4.5+ stars</option>
            </select>
          </label>
          <label>
            Delivery
            <select
              value={maxDelivery}
              onChange={(event) => setMaxDelivery(Number(event.target.value))}
            >
              <option value="60">Any time</option>
              <option value="20">Under 20 min</option>
              <option value="30">Under 30 min</option>
              <option value="45">Under 45 min</option>
            </select>
          </label>
          <label>
            Sort
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
            >
              <option>AI Match</option>
              <option>Rating</option>
              <option>Fastest</option>
              <option>Price low</option>
              <option>Price high</option>
            </select>
          </label>
        </div>
        <div className="food-grid">
          {visibleFoods.map((food) => (
            <article className="food-card" key={food.id}>
              <div className="food-image">
                <img src={food.image} alt={food.name} />
                <div className="match-badge">
                  <Sparkles size={12} /> {food.match}% match
                </div>
                <button
                  className={`heart-button ${favorites.includes(food.id) ? "liked" : ""}`}
                  onClick={() => toggleFavorite(food.id)}
                  aria-label="Save food"
                >
                  <Heart
                    size={17}
                    fill={favorites.includes(food.id) ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <div className="food-content">
                <div className="food-title">
                  <div>
                    <h3>{food.name}</h3>
                    <p>
                      {food.restaurant} <span>·</span> {food.cuisine}
                    </p>
                  </div>
                  <span className="rating">
                    <Star size={13} fill="currentColor" /> {food.rating}
                  </span>
                </div>
                <div className="reason">
                  <Sparkles size={14} />
                  <span>
                    <strong>Why this fits:</strong> {food.reason}
                  </span>
                </div>
                <div className="food-footer">
                  <div>
                    <strong>₹{food.price}</strong>
                    <span>
                      <Clock3 size={13} /> {food.time} min
                    </span>
                  </div>
                  <button
                    className="add-button"
                    onClick={() => addToCart(food.id)}
                  >
                    {cart.some((item) => item.id === food.id) ? (
                      "Added"
                    ) : (
                      <>
                        <Plus size={17} /> Add
                      </>
                    )}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {visibleFoods.length === 0 && (
          <div className="empty-results">
            <h3>No dishes match this mood yet.</h3>
            <p>Try another category or show all food items.</p>
            <button
              className="reset-results"
              onClick={() => {
                setQuery("");
                setActiveCategory("All");
                setVegOnly(false);
                setHealthyOnly(false);
                setCuisineFilter("All");
                setMinRating(0);
                setMaxDelivery(60);
              }}
            >
              Show all food items
            </button>
          </div>
        )}
      </section>
      {recentlyViewedFoods.length > 0 && (
        <section className="restaurant-section recently-viewed-section">
          <div className="section-heading">
            <div><div className="eyebrow orange">Your recent browsing</div><h2>Recently viewed</h2></div>
          </div>
          <div className="food-grid">
            {recentlyViewedFoods.map((food) => (
              <FoodCard
                key={food.id}
                food={food}
                favorite={favorites.includes(food.id)}
                inCart={cart.some((item) => item.id === food.id)}
                onFavorite={() => toggleFavorite(food.id)}
                onAdd={() => addToCart(food.id)}
                onSelect={() => openFood(food.id)}
              />
            ))}
          </div>
        </section>
      )}
      <section className="insight-band" id="how-it-works">
        <div className="insight-icon">
          <Sparkles size={22} />
        </div>
        <div>
          <div className="eyebrow">The FoodFusion difference</div>
          <h2>Your taste, in motion.</h2>
          <p>
            Every save, order, and rating makes your next set of picks sharper.
            You stay in control; the system simply pays attention.
          </p>
        </div>
        <div className="insight-stats">
          <div>
            <strong>12k+</strong>
            <span>taste profiles</span>
          </div>
          <div>
            <strong>4.8</strong>
            <span>avg. satisfaction</span>
          </div>
        </div>
      </section>
      {showPreferences && (
        <div
          className="modal-backdrop"
          onClick={() => setShowPreferences(false)}
        >
          <div
            className="preference-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setShowPreferences(false)}
            >
              <X size={19} />
            </button>
            <div className="eyebrow orange">
              <Sparkles size={14} /> Quick taste setup
            </div>
            <h2>
              Tell us your kind
              <br />
              of delicious.
            </h2>
            <p>
              We’ll use this to make your first round of picks feel uncanny.
            </p>
            <label>What are you eating lately?</label>
            <div className="choice-grid">
              {(["Vegetarian", "Everything", "Vegan"] as const).map((diet) => (
                <button
                  key={diet}
                  className={`choice ${preferences.diet === diet ? "active" : ""}`}
                  onClick={() =>
                    setPreferences((current) => ({ ...current, diet }))
                  }
                >
                  {diet}
                </button>
              ))}
            </div>
            <label>Choose your comfort cuisines</label>
            <div className="choice-grid cuisines">
              {["Indian", "Chinese", "Italian", "Mexican"].map((cuisine) => (
                <button
                  key={cuisine}
                  className={`choice ${preferences.cuisines.includes(cuisine) ? "active" : ""}`}
                  onClick={() =>
                    setPreferences((current) => ({
                      ...current,
                      cuisines: current.cuisines.includes(cuisine)
                        ? current.cuisines.filter((item) => item !== cuisine)
                        : [...current.cuisines, cuisine],
                    }))
                  }
                >
                  {cuisine}
                </button>
              ))}
            </div>
            <label>Favorite food categories</label>
            <div className="choice-grid cuisines">
              {categories.map((category) => (
                <button
                  key={category.name}
                  className={`choice ${preferences.categories.includes(category.name) ? "active" : ""}`}
                  onClick={() => setPreferences((current) => ({
                    ...current,
                    categories: current.categories.includes(category.name)
                      ? current.categories.filter((item) => item !== category.name)
                      : [...current.categories, category.name],
                  }))}
                >
                  {category.name}
                </button>
              ))}
            </div>
            <div className="modal-preference-fields">
              <label>
                Budget up to ₹{preferences.maxBudget}
                <input
                  type="range"
                  min="150"
                  max="500"
                  step="10"
                  value={preferences.maxBudget}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      maxBudget: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Spice
                <select
                  value={preferences.spice}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      spice: event.target.value as Preferences["spice"],
                    }))
                  }
                >
                  <option>Mild</option>
                  <option>Medium</option>
                  <option>Spicy</option>
                </select>
              </label>
              <label>
                Meal
                <select
                  value={preferences.meal}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      meal: event.target.value as Preferences["meal"],
                    }))
                  }
                >
                  <option>Breakfast</option>
                  <option>Lunch</option>
                  <option>Dinner</option>
                  <option>Snacks</option>
                </select>
              </label>
              <label>
                Health
                <select
                  value={preferences.health}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      health: event.target.value as Preferences["health"],
                    }))
                  }
                >
                  <option>Healthy</option>
                  <option>Regular</option>
                  <option>Both</option>
                </select>
              </label>
              <label>
                Avoid ingredients
                <input
                  value={preferences.avoid}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      avoid: event.target.value,
                    }))
                  }
                  placeholder="peanuts, mushrooms..."
                />
              </label>
            </div>
            <button
              className="primary-button full"
              onClick={() => setShowPreferences(false)}
            >
              Show my matches <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}
      {showLocation && (
        <div className="modal-backdrop" onClick={() => setShowLocation(false)}>
          <div
            className="small-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setShowLocation(false)}
            >
              <X size={19} />
            </button>
            <div className="eyebrow orange">
              <MapPin size={14} /> Delivery location
            </div>
            <h2>Where should we bring it?</h2>
            <p className="checkout-subtitle">
              Choose a real city, state, or neighborhood in India.
            </p>
            <input
              className={`checkout-input location-input ${locationError ? "input-error" : ""}`}
              value={locationDraft}
              onChange={(event) => {
                setLocationDraft(event.target.value);
                setLocationError("");
              }}
              list="india-locations"
              placeholder="Bengaluru, India"
            />
            <datalist id="india-locations">
              {knownLocations.map((place) => (
                <option key={place} value={place} />
              ))}
            </datalist>
            {locationError && <p className="location-error">{locationError}</p>}
            <div className="location-suggestions">
              {knownLocations
                .filter(
                  (place) =>
                    locationDraft &&
                    place.toLowerCase().includes(locationDraft.toLowerCase()),
                )
                .slice(0, 5)
                .map((place) => (
                  <button
                    key={place}
                    className="suggestion"
                    onClick={() => {
                      setLocationDraft(place);
                      setLocationError("");
                    }}
                  >
                    {place}
                  </button>
                ))}
            </div>
            <button
              className="primary-button full"
              disabled={!locationDraft.trim()}
              onClick={() => {
                const normalized = locationDraft.trim().toLowerCase();
                const valid = knownLocations.some((place) =>
                  normalized.includes(place.toLowerCase()),
                );
                if (!valid) {
                  setLocationError(
                    "Please enter a valid Indian city, state, or neighborhood.",
                  );
                  return;
                }
                setLocation(locationDraft.trim());
                setShowLocation(false);
              }}
            >
              Use this location <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}
      {showAuth && (
        <div className="modal-backdrop">
          <div
            className="small-modal auth-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="eyebrow orange">
              <Sparkles size={14} /> FoodFusion account
            </div>
            <h2>{authMode === "login" ? "Welcome back." : "Make it personal."}</h2>
            <p className="checkout-subtitle">
              Save preferences, favorites, and orders across sessions.
            </p>
            {authMode === "signup" && (
              <>
                <label htmlFor="auth-name">Your name</label>
                <input
                  id="auth-name"
                  className="checkout-input"
                  value={authName}
                  onChange={(event) => setAuthName(event.target.value)}
                  placeholder="Arjun Sharma"
                  autoComplete="name"
                  required
                />
              </>
            )}
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="checkout-input"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="checkout-input"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              type="password"
              autoComplete={authMode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              placeholder="At least 8 characters"
              required
            />
            {authError && <p className="checkout-error" role="alert">{authError}</p>}
            <button className="primary-button full" onClick={submitAuth} disabled={authBusy}>
              {authBusy ? "Please wait..." : authMode === "login" ? "Log in" : "Create account"} <ArrowRight size={17} />
            </button>
            <button
              className="auth-switch"
              onClick={() => {
                setAuthError("");
                setAuthMode(authMode === "login" ? "signup" : "login");
              }}
            >
              {authMode === "login"
                ? "Need an account? Sign up"
                : "Already have an account? Log in"}
            </button>
          </div>
        </div>
      )}
      {showCart && (
        <div className="modal-backdrop" onClick={() => setShowCart(false)}>
          <div
            className="cart-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <div className="eyebrow orange">Your table</div>
                <h2>
                  Your bag <span>({cartCount})</span>
                </h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowCart(false)}
              >
                <X size={19} />
              </button>
            </div>
            {cart.length === 0 ? (
              <div className="empty-cart">
                <ShoppingBag size={30} />
                <p>Your bag is ready when you are.</p>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => {
                    const food = foods.find((entry) => entry.id === item.id)!;
                    return (
                      <div className="cart-item" key={item.id}>
                        <img src={food.image} alt="" />
                        <div>
                          <strong>{food.name}</strong>
                          <span>{food.restaurant}</span>
                        </div>
                        <div className="quantity-control">
                          <button onClick={() => updateQuantity(item.id, -1)}>
                            -
                          </button>
                          <span>{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1)}>
                            +
                          </button>
                        </div>
                        <b>₹{food.price * item.quantity}</b>
                      </div>
                    );
                  })}
                </div>
                <div className="cart-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>₹{subtotal}</strong>
                  </div>
                  <div>
                    <span>Delivery</span>
                    <strong className="free">
                      {deliveryFee ? `₹${deliveryFee}` : "FREE"}
                    </strong>
                  </div>
                  <div>
                    <span>Discount</span>
                    <strong className="free">-₹{discount}</strong>
                  </div>
                  <div>
                    <span>Tax</span>
                    <strong>₹{tax}</strong>
                  </div>
                  <div className="total">
                    <span>Total</span>
                    <strong>₹{cartTotal}</strong>
                  </div>
                  <button
                    className="primary-button full"
                    onClick={() => {
                      setShowCart(false);
                      setShowCheckout(true);
                    }}
                  >
                    Continue to checkout <ArrowRight size={17} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {selectedFood && (
        <div className="modal-backdrop" onClick={() => setSelectedFood(null)}>
          <div
            className="food-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setSelectedFood(null)}
            >
              <X size={19} />
            </button>
            <img src={selectedFood.image} alt={selectedFood.name} />
            <div className="food-detail-copy">
              <div className="eyebrow orange">
                <Sparkles size={14} /> AI insight ·{" "}
                {scoreFood(selectedFood, preferences).match}% match
              </div>
              <h2>{selectedFood.name}</h2>
              <p className="detail-restaurant">
                {selectedFood.restaurant} · {selectedFood.cuisine}
              </p>
              <p>
                Recommended because it{" "}
                {scoreFood(selectedFood, preferences).reason}. A popular choice
                with a {selectedFood.rating} rating and delivery in about{" "}
                {selectedFood.time} minutes.
              </p>
              <div className="detail-meta">
                <span>₹{selectedFood.price}</span>
                <span>
                  <Star size={14} fill="currentColor" /> {selectedFood.rating}
                </span>
                <span>
                  <Clock3 size={14} /> {selectedFood.time} min
                </span>
              </div>
              <button
                className="primary-button full"
                onClick={() => {
                  addToCart(selectedFood.id);
                  setSelectedFood(null);
                  setShowCart(true);
                }}
              >
                Add to bag <Plus size={17} />
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedRestaurant && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedRestaurant(null)}
        >
          <div
            className="restaurant-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setSelectedRestaurant(null)}
            >
              <X size={19} />
            </button>
            <img src={selectedRestaurant.image} alt={selectedRestaurant.name} />
            <div className="restaurant-detail-copy">
              <div className="eyebrow orange">
                <Sparkles size={14} /> Restaurant profile
              </div>
              <h2>{selectedRestaurant.name}</h2>
              <p className="detail-restaurant">
                {selectedRestaurant.cuisine} · {selectedRestaurant.distance}
              </p>
              <p>{selectedRestaurant.description}</p>
              <div className="restaurant-detail-stats">
                <span>
                  <Star size={14} fill="currentColor" />{" "}
                  {selectedRestaurant.rating}
                </span>
                <span>
                  <Clock3 size={14} /> {selectedRestaurant.delivery} min
                </span>
                <span>
                  {selectedRestaurant.fee
                    ? `₹${selectedRestaurant.fee} fee`
                    : "Free delivery"}
                </span>
              </div>
              <div className="detail-actions">
                <button
                  className="primary-button"
                  onClick={() =>
                    toggleRestaurantFavorite(selectedRestaurant.id)
                  }
                >
                  <Heart
                    size={16}
                    fill={
                      restaurantFavorites.includes(selectedRestaurant.id)
                        ? "currentColor"
                        : "none"
                    }
                  />{" "}
                  {restaurantFavorites.includes(selectedRestaurant.id)
                    ? "Saved"
                    : "Save restaurant"}
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setSelectedRestaurant(null);
                    setCompareFoods(foods.slice(0, 2));
                  }}
                >
                  Compare restaurants <ArrowRight size={16} />
                </button>
              </div>
              <div className="restaurant-menu-preview">
                <h3>Menu</h3>
                {foods.filter((food) => food.restaurant === selectedRestaurant.name).map((food) => (
                  <div className="restaurant-menu-preview-row" key={food.id}>
                    <button className="restaurant-menu-item" onClick={() => { setSelectedRestaurant(null); openFood(food.id); }}>
                      <span><strong>{food.name}</strong><small>{food.category}</small></span>
                      <b>₹{food.price}</b>
                    </button>
                    <button className="icon-button" aria-label={`Add ${food.name} to cart`} onClick={() => addToCart(food.id)}><Plus size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {showSaved && (
        <div className="modal-backdrop" onClick={() => setShowSaved(false)}>
          <div
            className="saved-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setShowSaved(false)}
            >
              <X size={19} />
            </button>
            <div className="eyebrow orange">
              <Heart size={14} /> Your collection
            </div>
            <h2>Saved for later.</h2>
            <div className="saved-section">
              <strong>Favorite foods</strong>
              {favorites.length ? (
                favorites.map((id) => {
                  const food = foods.find((item) => item.id === id)!;
                  return (
                    <button
                      className="saved-row"
                      key={id}
                      onClick={() => {
                        setShowSaved(false);
                        setSelectedFood(food);
                      }}
                    >
                      <img src={food.image} alt="" />
                      <span>
                        {food.name}
                        <small>
                          {food.restaurant} · ₹{food.price}
                        </small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  );
                })
              ) : (
                <p className="empty-copy">
                  Tap the heart on any dish to save it here.
                </p>
              )}
            </div>
            <div className="saved-section">
              <strong>Favorite restaurants</strong>
              {restaurantFavorites.length ? (
                restaurantFavorites.map((id) => {
                  const restaurant = restaurants.find(
                    (item) => item.id === id,
                  )!;
                  return (
                    <button
                      className="saved-row"
                      key={id}
                      onClick={() => {
                        setShowSaved(false);
                        setSelectedRestaurant(restaurant);
                      }}
                    >
                      <img src={restaurant.image} alt="" />
                      <span>
                        {restaurant.name}
                        <small>{restaurant.cuisine}</small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  );
                })
              ) : (
                <p className="empty-copy">
                  Save a restaurant to build your shortlist.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {showProfile && (
        <div className="modal-backdrop" onClick={() => setShowProfile(false)}>
          <div
            className="profile-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setShowProfile(false)}
            >
              <X size={19} />
            </button>
            <div className="profile-avatar">
              {account?.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="eyebrow orange">Taste profile</div>
            <h2>{account?.name}</h2>
            <p>{account?.email}</p>
            <p>
              Your profile is learning from {favorites.length + cartCount} saved
              and ordered choices.
            </p>
            <div className="profile-stat-row">
              <span>
                <strong>{favorites.length}</strong> saved foods
              </span>
              <span>
                <strong>{restaurantFavorites.length}</strong> saved places
              </span>
              <span>
                <strong>{reviewSubmitted ? 1 : 0}</strong> reviews
              </span>
            </div>
            <button
              className="primary-button full"
              onClick={() => {
                setShowProfile(false);
                setShowPreferences(true);
              }}
            >
              Edit preferences <SlidersHorizontal size={16} />
            </button>
            <button
              className="auth-switch"
              onClick={logout}
            >
              Log out
            </button>
          </div>
        </div>
      )}
      {showCheckout && (
        <div className="modal-backdrop" onClick={() => setShowCheckout(false)}>
          <div
            className="checkout-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setShowCheckout(false)}
            >
              <X size={19} />
            </button>
            {orderPlaced ? (
              <div className="order-success">
                <span className="success-mark">
                  <Sparkles size={24} />
                </span>
                <div className="eyebrow orange">Order confirmed</div>
                <h2>Your order was placed. Thank you for ordering.</h2>
                <p>
                  Your order <strong>{activeOrderId}</strong> is placed. Follow each status update from your Orders page.
                </p>
                <button
                  className="primary-button full"
                  onClick={() => {
                    setOrderPlaced(false);
                    setShowCheckout(false);
                    setCart([]);
                  }}
                >
                  Back to discovery <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <>
                <div className="eyebrow orange">Almost there</div>
                <h2>Make it yours.</h2>
                <p className="checkout-subtitle">
                  Confirm your delivery details and payment method.
                </p>
                <label htmlFor="checkout-modal-name">Your name</label>
                <input
                  id="checkout-modal-name"
                  className="checkout-input"
                  value={checkoutName}
                  onChange={(event) => { setCheckoutName(event.target.value); setCheckoutError(""); }}
                  placeholder={account?.name || "Your name"}
                />
                <label htmlFor="checkout-modal-address">Delivery address</label>
                <textarea
                  id="checkout-modal-address"
                  className="checkout-input address-input"
                  value={checkoutAddress}
                  onChange={(event) => { setCheckoutAddress(event.target.value); setCheckoutError(""); }}
                  placeholder="Apartment, street, and landmark"
                />
                <label>Payment method</label>
                <div className="payment-row">
                  {["Cash on delivery", "UPI", "Card"].map((method) => (
                    <button
                      key={method}
                      className={`choice ${selectedPayment === method ? "active" : ""}`}
                      aria-pressed={selectedPayment === method}
                      onClick={() => setSelectedPayment(method)}
                    >
                      {method}
                    </button>
                  ))}
                </div>
                {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
                <div className="checkout-total">
                  <span>Total</span>
                  <strong>₹{cartTotal}</strong>
                </div>
                <button className="primary-button full" onClick={() => void placeOrder()}>
                  Place order <ArrowRight size={17} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {compareFoods.length > 0 && (
        <div className="modal-backdrop" onClick={() => setCompareFoods([])}>
          <div
            className="compare-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setCompareFoods([])}
            >
              <X size={19} />
            </button>
            <div className="eyebrow orange">
              <Sparkles size={14} /> AI comparison
            </div>
            <h2>
              Two good ideas.
              <br />
              <em>One clear pick.</em>
            </h2>
            <div className="compare-grid">
              {compareFoods.map((food) => (
                <div className="compare-card" key={food.id}>
                  <img src={food.image} alt={food.name} />
                  <strong>{food.restaurant}</strong>
                  <span>{food.name}</span>
                  <b>
                    <Star size={13} fill="currentColor" /> {food.rating}
                  </b>
                  <small>
                    {food.time} min · ₹{food.price}
                  </small>
                  <small>{scoreFood(food, preferences).match}% AI match</small>
                </div>
              ))}
            </div>
            <div className="compare-winner">
              <Sparkles size={15} />
              <span>
                <strong>AI recommended choice:</strong>{" "}
                {compareFoods[0].restaurant}, with the stronger match for your
                current preferences.
              </span>
            </div>
          </div>
        </div>
      )}
      {orderPlaced && !showCheckout && (
        <div className="tracking-panel">
          <div className="tracking-header">
            <div>
              <div className="eyebrow orange">Order {activeOrderId || orders[0]?.id}</div>
              <h2>On its way to you.</h2>
              <p>{activeTrackingOrder?.estimatedDelivery || 35} min estimated · {activeTrackingOrder?.items.map((item) => item.restaurant).filter(Boolean).filter((name, index, all) => all.indexOf(name) === index).join(", ")}</p>
            </div>
            <button
              className="close-button"
              onClick={() => setOrderPlaced(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="tracking-line">
            {ORDER_STAGES.map(
              (stage, index) => (
                <button
                  key={stage}
                  className={index + 1 <= trackingStage ? "done" : ""}
                  disabled={index + 1 !== trackingStage + 1}
                  onClick={() => {
                    const activeOrder = orders.find((order) => order.id === activeOrderId) || orders[0];
                    if (activeOrder) void advanceOrder(activeOrder.id, index + 1);
                    else setTrackingStage(index + 1);
                  }}
                >
                  <span>{index + 1 <= trackingStage ? "✓" : index + 1}</span>
                  {stage}
                </button>
              ),
            )}
          </div>
          {trackingStage >= 6 && !reviewSubmitted && orders[0] && (
            <div className="review-box">
              <div className="eyebrow orange">
                Help your next recommendation
              </div>
              <h3>How did it land?</h3>
              <div className="review-stars">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() => setReviewRating(value)}
                    className={value <= reviewRating ? "active" : ""}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value)}
                placeholder="A note for the next hungry person..."
              />
              <button
                className="primary-button"
                onClick={() => void submitOrderReview(orders.find((order) => order.id === activeOrderId) || orders[0])}
              >
                Save review <ArrowRight size={17} />
              </button>
            </div>
          )}
          {reviewSubmitted && (
            <div className="review-saved">
              <Sparkles size={18} /> Thanks. Your review will shape future
              picks.
            </div>
          )}
        </div>
      )}
    </main>
  );
}
export default App;
