import { type ButtonHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed",
        {
          "bg-navy text-white hover:bg-navy-light focus:ring-navy": variant === "primary",
          "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 focus:ring-gray-300": variant === "secondary",
          "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500": variant === "danger",
          "text-gray-600 hover:bg-gray-100 focus:ring-gray-300": variant === "ghost",
        },
        { "px-2.5 py-1 text-xs": size === "sm", "px-4 py-2 text-sm": size === "md", "px-5 py-2.5 text-base": size === "lg" },
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
Button.displayName = "Button";
