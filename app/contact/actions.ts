"use server";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export type ContactState = {
  success?: boolean;
  error?: string;
};

export async function sendContactEmail(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const name = formData.get("name")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const message = formData.get("message")?.toString().trim();

  if (!name || !email || !message) {
    return { error: "All fields are required." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const { error } = await resend.emails.send({
    from: "Go See Art SF <hello@goseeartsf.com>",
    to: "lballard.cat@gmail.com",
    subject: `Message from ${name}`,
    text: `From: ${name} <${email}>\n\n${message}`,
    replyTo: email,
  });

  if (error) {
    console.error("Resend error:", error);
    return { error: "Something went wrong. Please try again later." };
  }

  return { success: true };
}
