import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Team Day Quiz - Slate Accounts",
  description: "Real-time Team Day Quiz",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        
        {/* ✅ Top Header */}
        <header className="topbar">
          <div className="brand3d">
            <span className="brandDot" />
            <span className="brandText">Slate Accounts</span>
          </div>
        </header>

        {/* ✅ Page Content */}
        <div className="pageWrap">
          {children}
        </div>

      </body>
    </html>
  );
}
