import ContactForm from "./ContactForm";

export const metadata = {
  title: "Contact — Go see art SF",
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Contact</h1>
      <p className="text-muted mb-10">
        Have a suggestion, found something missing, or just want to say hi?
      </p>
      <ContactForm />
    </div>
  );
}
