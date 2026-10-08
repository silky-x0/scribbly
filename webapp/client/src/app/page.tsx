import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";

export const metadata: Metadata = {
  title: "Doodle Club — Draw a little. Laugh a lot.",
  description:
    "Your next drawing and guessing game night starts here. A playful new home for doodles, friends, and happy accidents.",
  openGraph: {
    title: "Doodle Club — Draw a little. Laugh a lot.",
    description:
      "A candy-colored drawing and guessing club. Bring your friends, not your art skills.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function Home() {
  return <LandingPage />;
}
