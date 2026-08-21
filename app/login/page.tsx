import Link from "next/link";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="w-full sticky top-0 z-50 border-b border-outline-variant flex justify-between items-center px-4 md:px-6 py-4 glass-panel border-x-0 border-t-0">
        <Link href="/" className="flex items-center h-8 gap-2">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="26" height="26" rx="6" stroke="#d2bbff" strokeWidth="1.5" />
            <path d="M8 9L13 19M20 9L15 19" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="font-display-lg text-primary text-[18px]">Vibe Edit</span>
        </Link>
        <Link
          href="/"
          className="font-label-caps text-[10px] text-on-surface-variant hover:text-primary uppercase tracking-widest transition-colors"
        >
          Back to home
        </Link>
      </nav>

      <main className="flex-grow flex items-center justify-center px-4 py-16">
        <LoginForm />
      </main>
    </div>
  );
}
