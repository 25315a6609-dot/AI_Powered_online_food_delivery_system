import { Clock3, Heart, Plus, Sparkles, Star } from "lucide-react";

export type FoodCardItem = {
  id: number;
  name: string;
  restaurant: string;
  cuisine: string;
  price: number;
  rating: number;
  time: number;
  image: string;
  match: number;
  reason: string;
};

type FoodCardProps = {
  food: FoodCardItem;
  favorite: boolean;
  inCart: boolean;
  onFavorite: () => void;
  onAdd: () => void;
  onSelect: () => void;
};

export default function FoodCard({
  food,
  favorite,
  inCart,
  onFavorite,
  onAdd,
  onSelect,
}: FoodCardProps) {
  return (
    <article className="food-card">
      <div className="food-image">
        <button className="food-image-action" onClick={onSelect} aria-label={`View ${food.name}`}>
          <img src={food.image} alt={food.name} loading="lazy" />
        </button>
        <div className="match-badge">
          <Sparkles size={12} /> {food.match}% match
        </div>
        <button
          className={`heart-button ${favorite ? "liked" : ""}`}
          onClick={onFavorite}
          aria-label={favorite ? `Remove ${food.name} from favorites` : `Save ${food.name}`}
          aria-pressed={favorite}
        >
          <Heart size={17} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="food-content">
        <div className="food-title">
          <div>
            <button className="food-name-button" onClick={onSelect}>
              {food.name}
            </button>
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
          <button className="add-button" onClick={onAdd}>
            {inCart ? "Added" : <><Plus size={17} /> Add</>}
          </button>
        </div>
      </div>
    </article>
  );
}