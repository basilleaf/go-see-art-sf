"use client";

import { useActionState } from "react";
import { type ContactState, sendContactEmail } from "./actions";

const initialState: ContactState = {};

export default function ContactForm() {
  const [state, formAction, pending] = useActionState(
    sendContactEmail,
    initialState
  );

  if (state.success) {
    return (
      <p className="text-sm text-foreground py-4">
        Message sent — thanks for reaching out!
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <p className="text-sm text-pink" role="alert">
          {state.error}
        </p>
      )}
      <div>
        <label htmlFor="name" className="block text-sm mb-1.5">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm mb-1.5">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink"
        />
      </div>
      <div>
        <label htmlFor="message" className="block text-sm mb-1.5">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink resize-none"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-pink text-white text-sm px-5 py-2 rounded hover:bg-pink-dark transition-colors disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
