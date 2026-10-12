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
import { login as apiLogin, signup as apiSignup } from "./services/authApi";
import { createPaymentIntent } from "./services/paymentApi";
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
  minBudget: number;
  maxBudget: number;
  spice: "Mild" | "Medium" | "Spicy";
  meal: "Breakfast" | "Lunch" | "Dinner" | "Snacks";
  health: "Healthy" | "Regular" | "Both";
  avoid: string;
};
type CartItem = { id: number; quantity: number };
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
};
type Account = { name: string; email: string; token?: string };

const defaultPreferences: Preferences = {
  diet: "Vegetarian",
  cuisines: ["Indian", "Chinese"],
  minBudget: 100,
  maxBudget: 300,
  spice: "Medium",
  meal: "Dinner",
  health: "Both",
  avoid: "",
};

function scoreFood(food: Food, preferences: Preferences) {
  let score = 58;
  const reasons: string[] = [];
  if (preferences.cuisines.includes(food.cuisine)) {
    score += 14;
    reasons.push(`${food.cuisine} cuisine`);
  }
  if (
    preferences.diet === "Everything" ||
    (preferences.diet === "Vegetarian" && food.veg) || (
      <strong>FF-2026-1025</strong>
    )
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
const foods: Food[] = [
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
    image:
      "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=85",
    match: 96,
    reason: "fits your Indian + healthy picks",
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
    image:
      "https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=900&q=85",
    match: 91,
    reason: "matches your craving for spice",
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
    image:
      "https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=900&q=85",
    match: 84,
    reason: "a cozy match for a low-spice night",
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
    image:
      "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=900&q=85",
    match: 88,
    reason: "light, quick, and under your budget",
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
    image:
      "https://images.unsplash.com/photo-1563379091339-03246963d96c?auto=format&fit=crop&w=900&q=85",
    match: 90,
    reason: "a highly rated Indian comfort classic",
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
    image:
      "https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=900&q=85",
    match: 86,
    reason: "spicy, fresh, and easy on the wallet",
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
    image:
      "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=900&q=85",
    match: 89,
    reason: "rich Indian comfort food for dinner",
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
    image:
      "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=85",
    match: 85,
    reason: "a simple, highly rated classic",
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
    image:
      "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=900&q=85",
    match: 87,
    reason: "quick, comforting, and vegetarian",
  },
  {
    id: 10,
    name: "Sesame Veggie Ramen",
    restaurant: "Wok Theory",
    cuisine: "Chinese",
    category: "Chinese",
    price: 279,
    rating: 4.6,
    time: 29,
    healthy: true,
    veg: true,
    spice: "Spicy",
    image:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=85",
    match: 88,
    reason: "warm, spicy noodles with fresh toppings",
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
    image:
      "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=85",
    match: 83,
    reason: "a sweet finish with fast delivery",
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
    image:
      "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=85",
    match: 82,
    reason: "refreshing and easy on the budget",
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
    image:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85",
    match: 86,
    reason: "fast, punchy, and satisfying",
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
    image:
      "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?auto=format&fit=crop&w=900&q=85",
    match: 89,
    reason: "healthy and perfect for a slow morning",
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
    image:
      "https://images.unsplash.com/photo-1631515242808-497c3fbd3972?auto=format&fit=crop&w=900&q=85",
    match: 92,
    reason: "fragrant, spicy, and deeply satisfying",
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
    image:
      "https://images.unsplash.com/photo-1599043513900-ed6fe01d3833?auto=format&fit=crop&w=900&q=85",
    match: 93,
    reason: "vegetarian comfort within your budget",
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
    image:
      "https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=900&q=85",
    match: 90,
    reason: "a bold pizza for a spicy mood",
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
    image:
      "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=900&q=85",
    match: 87,
    reason: "fresh, bright, and vegetarian",
  },
];
const categories = [
  { name: "Biryani", icon: "🍚", color: "coral" },
  { name: "Pizza", icon: "🍕", color: "gold" },
  { name: "Burgers", icon: "🍔", color: "peach" },
  { name: "Healthy", icon: "🥗", color: "mint" },
  { name: "Chinese", icon: "🥢", color: "blue" },
  { name: "South Indian", icon: "🥞", color: "gold" },
  { name: "North Indian", icon: "🫓", color: "coral" },
  { name: "Desserts", icon: "🍰", color: "lilac" },
  { name: "Beverages", icon: "🧃", color: "peach" },
];
const restaurants: Restaurant[] = [
  {
    id: 1,
    name: "Saffron & Soil",
    cuisine: "Indian · Healthy",
    rating: 4.8,
    delivery: 24,
    fee: 0,
    distance: "1.2 km",
    image:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=85",
    description:
      "Ingredient-led Indian comfort food with bright, thoughtful plates.",
  },
  {
    id: 2,
    name: "Wok Theory",
    cuisine: "Chinese · Asian",
    rating: 4.7,
    delivery: 31,
    fee: 29,
    distance: "2.4 km",
    image:
      "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=85",
    description:
      "High-heat wok dishes, house sauces, and seriously good crunch.",
  },
  {
    id: 3,
    name: "Nourish Lab",
    cuisine: "Continental · Healthy",
    rating: 4.9,
    delivery: 18,
    fee: 0,
    distance: "0.8 km",
    image:
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=85",
    description:
      "Fresh bowls, cloud-like desserts, and easy weekday nourishment.",
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
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [vegOnly, setVegOnly] = useState(false);
  const [healthyOnly, setHealthyOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxDelivery, setMaxDelivery] = useState(60);
  const [cuisineFilter, setCuisineFilter] = useState("All");
  const [sortMode, setSortMode] = useState("AI Match");
  const [showPreferences, setShowPreferences] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [location, setLocation] = useState(
    () => localStorage.getItem("ff-location") || "Indiranagar",
  );
  const [locationDraft, setLocationDraft] = useState(
    () => localStorage.getItem("ff-location") || "Indiranagar",
  );
  const [locationError, setLocationError] = useState("");
  const [account, setAccount] = useState<Account | null>(() =>
    JSON.parse(localStorage.getItem("ff-account") || "null"),
  );
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState("Cash on delivery");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] =
    useState<Restaurant | null>(null);
  const [compareFoods, setCompareFoods] = useState<Food[]>([]);
  const [trackingStage, setTrackingStage] = useState(1);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
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
  const [cart, setCart] = useState<CartItem[]>(() => {
    const stored = JSON.parse(localStorage.getItem("ff-cart") || "[]") as Array<
      number | CartItem
    >;
    return stored.map((item) =>
      typeof item === "number" ? { id: item, quantity: 1 } : item,
    );
  });
  useEffect(
    () => localStorage.setItem("ff-favorites", JSON.stringify(favorites)),
    [favorites],
  );
  useEffect(
    () => localStorage.setItem("ff-cart", JSON.stringify(cart)),
    [cart],
  );
  useEffect(
    () =>
      localStorage.setItem(
        "ff-restaurant-favorites",
        JSON.stringify(restaurantFavorites),
      ),
    [restaurantFavorites],
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
  }, []);
  useEffect(
    () => localStorage.setItem("ff-preferences", JSON.stringify(preferences)),
    [preferences],
  );
  const searchText = query.toLowerCase();
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
          const matchesText =
            `${food.name} ${food.restaurant} ${food.cuisine} ${food.category}`
              .toLowerCase()
              .includes(searchText);
          const matchesSmartQuery =
            (!searchBudget || food.price <= searchBudget) &&
            (!searchText.includes("healthy") || food.healthy) &&
            (!searchText.includes("vegetarian") || food.veg) &&
            (!searchText.includes("spicy") || food.spice === "Spicy") &&
            (!searchText.includes("fast") || food.time <= 25);
          return (
            matchesText &&
            matchesSmartQuery &&
            (activeCategory === "All" || food.category === activeCategory) &&
            (cuisineFilter === "All" || food.cuisine === cuisineFilter) &&
            food.rating >= minRating &&
            food.time <= maxDelivery &&
            (!vegOnly || food.veg) &&
            (!healthyOnly || food.healthy)
          );
        })
        .map((food) => ({ ...food, ...scoreFood(food, preferences) }))
        .sort((a, b) =>
          sortMode === "Price low"
            ? a.price - b.price
            : sortMode === "Price high"
              ? b.price - a.price
              : sortMode === "Rating"
                ? b.rating - a.rating
                : sortMode === "Fastest"
                  ? a.time - b.time
                  : b.match - a.match,
        ),
    [
      activeCategory,
      healthyOnly,
      preferences,
      searchBudget,
      searchText,
      vegOnly,
      cuisineFilter,
      maxDelivery,
      minRating,
      sortMode,
    ],
  );
  const toggleFavorite = (id: number) =>
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const toggleRestaurantFavorite = (id: number) =>
    setRestaurantFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
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
    try {
      const response =
        authMode === "signup"
          ? await apiSignup(
              authName || "FoodFusion friend",
              authEmail,
              authPassword,
            )
          : await apiLogin(authEmail, authPassword);
      setAccount({ ...response.user, token: response.access_token });
    } catch {
      setAccount({
        name:
          authMode === "signup"
            ? authName || "FoodFusion friend"
            : authEmail.split("@")[0] || "FoodFusion friend",
        email: authEmail,
      });
    }
    setShowAuth(false);
  };
  const placeOrder = async () => {
    if (cartCount === 0) return;
    if (account?.token) {
      try {
        await Promise.race([
          createPaymentIntent(account.token, cartTotal),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Payment service timeout")),
              4000,
            ),
          ),
        ]);
      } catch {
        /* Demo mode confirms locally when the optional payment service is unavailable. */
      }
    }
    setOrderPlaced(true);
  };

  if (route.pathname !== "/") {
    const routeTitles: Record<string, string> = {
      "/explore": "Explore everything",
      "/favorites": "Your favorites",
      "/compare": "Compare restaurants",
      "/cart": "Your cart",
      "/orders": "Order history",
      "/profile": "Your profile",
      "/preferences": "Your preferences",
    };
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
          <div className="route-nav">
            <Link to="/">Home</Link>
            <Link to="/favorites">Favorites</Link>
            <Link to="/orders">Orders</Link>
            <Link to="/profile">Profile</Link>
          </div>
          <button className="cart-button" onClick={() => navigate("/cart")}>
            <ShoppingBag size={19} />
            <span>{cartCount}</span>
          </button>
        </nav>
        <section className="route-content">
          <div className="eyebrow orange">
            <Sparkles size={14} /> FoodFusion workspace
          </div>
          <h1>{routeTitles[route.pathname] || "Page not found"}</h1>
          {route.pathname === "/explore" && (
            <>
              <p className="route-lead">
                Search, filter, and compare dishes with your current taste
                profile.
              </p>
              <Link className="primary-button route-cta" to="/">
                Back to discovery <ArrowRight size={17} />
              </Link>
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
                        onClick={() =>
                          setFavorites((current) =>
                            current.filter((item) => item !== id),
                          )
                        }
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
            <div className="compare-route-grid">
              {restaurants.map((restaurant) => (
                <article className="compare-route-card" key={restaurant.id}>
                  <img src={restaurant.image} alt="" />
                  <h3>{restaurant.name}</h3>
                  <p>{restaurant.cuisine}</p>
                  <strong>
                    <Star size={13} fill="currentColor" /> {restaurant.rating}
                  </strong>
                  <span>
                    {restaurant.delivery} min · {restaurant.distance}
                  </span>
                </article>
              ))}
            </div>
          )}
          {route.pathname === "/cart" && (
            <div className="route-cart">
              <p>
                {cartCount} item(s) · Subtotal ₹{subtotal}
              </p>
              <p>
                Delivery ₹{deliveryFee} · Tax ₹{tax} · Discount -₹{discount}
              </p>
              <h2>Grand total ₹{cartTotal}</h2>
              <button
                className="primary-button"
                onClick={() => {
                  setShowCheckout(true);
                  navigate("/");
                }}
              >
                Continue to checkout <ArrowRight size={17} />
              </button>
            </div>
          )}
          {route.pathname === "/orders" && (
            <div className="order-route-card">
              <div className="eyebrow orange">FF-2026-1025</div>
              <h2>{orderPlaced ? "Order in progress" : "No active order"}</h2>
              <p>
                {orderPlaced
                  ? "Restaurant accepted your order. Track delivery from the home screen."
                  : "Place a mock order to see its timeline here."}
              </p>
              <Link className="primary-button" to="/">
                Discover food <ArrowRight size={17} />
              </Link>
            </div>
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
                  onClick={() => setAccount(null)}
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
              <p>Preferences are saved automatically as you change them.</p>
              <Link className="primary-button" to="/">
                Edit preferences <SlidersHorizontal size={16} />
              </Link>
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
        <div className="nav-links">
          <Link className="active" to="/">
            Home
          </Link>
          <Link to="/favorites">Favorites</Link>
          <Link to="/orders">Orders</Link>
          <Link to="/profile">Profile</Link>
        </div>
        <div className="nav-actions">
          <button className="location" onClick={() => setShowLocation(true)}>
            <MapPin size={15} /> {location} <ChevronDown size={14} />
          </button>
          <button className="icon-button menu-button" aria-label="Open menu">
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
        <div className="modal-backdrop" onClick={() => setShowAuth(false)}>
          <div
            className="small-modal auth-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="close-button" onClick={() => setShowAuth(false)}>
              <X size={19} />
            </button>
            <div className="eyebrow orange">
              <Sparkles size={14} /> FoodFusion account
            </div>
            <h2>
              {authMode === "login" ? "Welcome back." : "Make it personal."}
            </h2>
            <p className="checkout-subtitle">
              Save preferences, favorites, and orders across sessions.
            </p>
            {authMode === "signup" && (
              <>
                <label>Your name</label>
                <input
                  className="checkout-input"
                  value={authName}
                  onChange={(event) => setAuthName(event.target.value)}
                  placeholder="Arjun Sharma"
                />
              </>
            )}
            <label>Email</label>
            <input
              className="checkout-input"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              type="email"
              placeholder="you@example.com"
            />
            <label>Password</label>
            <input
              className="checkout-input"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              type="password"
              placeholder="••••••••"
            />
            <button className="primary-button full" onClick={submitAuth}>
              {authMode === "login" ? "Log in" : "Create account"}{" "}
              <ArrowRight size={17} />
            </button>
            <button
              className="auth-switch"
              onClick={() =>
                setAuthMode(authMode === "login" ? "signup" : "login")
              }
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
              onClick={() => {
                setAccount(null);
                setShowProfile(false);
              }}
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
                <h2>Good choice.</h2>
                <p>
                  Your mock order <strong>FF-2026-1025</strong> is being
                  prepared by the restaurant.
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
                  A quick mock checkout for your portfolio demo.
                </p>
                <label>Your name</label>
                <input className="checkout-input" placeholder="Arjun Sharma" />
                <label>Delivery address</label>
                <textarea
                  className="checkout-input address-input"
                  placeholder="Apartment, street, landmark"
                />
                <label>Payment method</label>
                <div className="payment-row">
                  {["Cash on delivery", "UPI", "Card"].map((method) => (
                    <button
                      key={method}
                      className={`choice ${selectedPayment === method ? "active" : ""}`}
                      onClick={() => setSelectedPayment(method)}
                    >
                      {method}
                    </button>
                  ))}
                </div>
                <div className="checkout-total">
                  <span>Total</span>
                  <strong>₹{cartTotal}</strong>
                </div>
                <button className="primary-button full" onClick={placeOrder}>
                  Place mock order <ArrowRight size={17} />
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
              <div className="eyebrow orange">Order FF-2026-1025</div>
              <h2>On its way to you.</h2>
              <p>Tap the next step to simulate delivery progress.</p>
            </div>
            <button
              className="close-button"
              onClick={() => setOrderPlaced(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="tracking-line">
            {["Confirmed", "Preparing", "Out for delivery", "Delivered"].map(
              (stage, index) => (
                <button
                  key={stage}
                  className={index < trackingStage ? "done" : ""}
                  onClick={() => setTrackingStage(index + 1)}
                >
                  <span>{index < trackingStage ? "✓" : index + 1}</span>
                  {stage}
                </button>
              ),
            )}
          </div>
          {trackingStage >= 4 && !reviewSubmitted && (
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
                onClick={() => {
                  localStorage.setItem(
                    "ff-last-review",
                    JSON.stringify({ rating: reviewRating, text: reviewText }),
                  );
                  setReviewSubmitted(true);
                }}
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
