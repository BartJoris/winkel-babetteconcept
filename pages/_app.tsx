import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import Navigation from "../components/Navigation";

const PAGES_WITHOUT_NAV = ['/foodtruck'];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const hideNav = PAGES_WITHOUT_NAV.includes(router.pathname);

  return (
    <>
      {!hideNav && <Navigation />}
      <Component {...pageProps} />
    </>
  );
}
