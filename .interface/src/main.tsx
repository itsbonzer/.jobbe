import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./styles.css"
import { Router } from "@/app/Router"
import { ThemeProvider } from "@/components/theme-provider.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <Router />
    </ThemeProvider>
  </StrictMode>
)
