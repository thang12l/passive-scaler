import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Passive Scaler",
  description: "Push-based auto-scaling webhook for Heroku apps",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
