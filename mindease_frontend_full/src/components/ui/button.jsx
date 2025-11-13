import React from "react";
import { cn } from "../../lib/utils";

export function Button({ className = "", ...props }) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-full px-6 py-3 bg-white/30 backdrop-blur-xl text-white shadow-md hover:bg-white/40 transition active:scale-95",
        className
      )}
    />
  );
}
