"use client";

import { useFormStatus } from "react-dom";

export function CreateInterviewSubmit({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className="button button-primary create-submit"
      type="submit"
    >
      {pending ? "Creating interview…" : "Create interview & start coordination"}
    </button>
  );
}
