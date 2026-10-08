import localFont from "next/font/local";
import "./globals.css";

const jakarta = localFont({
  src: [
    { path: "./fonts/plus-jakarta-sans-400-latin.woff2", weight: "400" },
    { path: "./fonts/plus-jakarta-sans-500-latin.woff2", weight: "500" },
    { path: "./fonts/plus-jakarta-sans-600-latin.woff2", weight: "600" },
    { path: "./fonts/plus-jakarta-sans-700-latin.woff2", weight: "700" },
    { path: "./fonts/plus-jakarta-sans-800-latin.woff2", weight: "800" },
  ],
  variable: "--font-sans",
  display: "swap",
});

const syne = localFont({
  src: [
    { path: "./fonts/syne-700-latin.woff2", weight: "700" },
    { path: "./fonts/syne-800-latin.woff2", weight: "800" },
  ],
  variable: "--font-display",
  display: "swap",
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className={`${jakarta.variable} ${syne.variable} min-h-full`}>
        {children}
      </body>
    </html>
  );
}
