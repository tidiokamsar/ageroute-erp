import { type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

const base = "block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy disabled:bg-gray-50 disabled:text-gray-500";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={clsx(base, className)} {...props} />
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={clsx(base, "cursor-pointer", className)} {...props}>{children}</select>
  )
);
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={clsx(base, "resize-y min-h-[80px]", className)} {...props} />
);
Textarea.displayName = "Textarea";

export function FormField({ label, required, error, children, className }: { label: string; required?: boolean; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("space-y-1", className)}>
      <label className="block text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
