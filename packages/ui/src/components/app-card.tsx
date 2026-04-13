import React from "react";
import { cn } from "../lib/utils";

interface AppCardProps {
  id: string;
  title: string;
  iconUrl: string;
  developerName: string;
  shortDescription: string;
  category: string;
  trustTier: string;
  isExperimental?: boolean;
  rating?: number;
  variant?: "grid" | "list";
  onClick?: () => void;
  className?: string;
}

export function AppCard({
  title, iconUrl, developerName, shortDescription, category,
  trustTier, isExperimental, rating, variant = "list", onClick, className,
}: AppCardProps) {
  if (variant === "grid") {
    return (
      <div
        onClick={onClick}
        className={cn(
          "group cursor-pointer rounded-xl border border-gray-100 bg-white p-4 shadow-sm",
          "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200",
          className
        )}
      >
        <div className="flex items-start gap-3 mb-3">
          <img
            src={iconUrl}
            alt={`${title} icon`}
            className="w-14 h-14 rounded-2xl object-cover shadow-sm"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' fill='%23e2e8f0'%3E%3Crect width='56' height='56' rx='16'/%3E%3C/svg%3E";
            }}
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {title}
            </h3>
            <p className="text-sm text-gray-500 truncate">{developerName}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 line-clamp-2 mb-3">{shortDescription}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{category}</span>
          <div className="flex items-center gap-1.5">
            {isExperimental && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                Experimental
              </span>
            )}
            {rating !== undefined && (
              <span className="text-xs font-medium text-amber-600 flex items-center gap-0.5">
                <svg className="w-3.5 h-3.5 fill-amber-400" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                {rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // List variant
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-center gap-4 cursor-pointer rounded-xl border border-gray-100 bg-white p-4 shadow-sm",
        "hover:shadow-md hover:border-gray-200 transition-all duration-200",
        className
      )}
    >
      <img
        src={iconUrl}
        alt={`${title} icon`}
        className="w-12 h-12 rounded-xl object-cover shadow-sm flex-shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' fill='%23e2e8f0'%3E%3Crect width='48' height='48' rx='12'/%3E%3C/svg%3E";
        }}
      />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
          {title}
        </h3>
        <p className="text-sm text-gray-500 truncate">{developerName}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isExperimental && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
            Experimental
          </span>
        )}
        {rating !== undefined && (
          <span className="text-xs font-medium text-amber-600 flex items-center gap-0.5">
            <svg className="w-3.5 h-3.5 fill-amber-400" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            {rating.toFixed(1)}
          </span>
        )}
        <span className="text-xs text-gray-400 uppercase tracking-wider">{category}</span>
      </div>
    </div>
  );
}
