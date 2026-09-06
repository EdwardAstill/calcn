import { createRoot } from "react-dom/client"
import { ScientificCalculator } from "@/registry/calculator/components"

createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen">
    <ScientificCalculator />
  </main>,
)
