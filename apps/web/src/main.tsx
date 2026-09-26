import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { ChatProvider } from "./lib/chat";
import Landing from "./pages/Landing";

// The dashboard is its own chunk so the marketing page loads fast.
const DashboardLayout = lazy(() => import("./pages/dashboard/Layout"));
const Overview = lazy(() => import("./pages/dashboard/Overview"));
const Leads = lazy(() => import("./pages/dashboard/Leads"));
const LeadDetail = lazy(() => import("./pages/dashboard/LeadDetail"));
const Conversations = lazy(() => import("./pages/dashboard/Conversations"));
const Appointments = lazy(() => import("./pages/dashboard/Appointments"));
const Actions = lazy(() => import("./pages/dashboard/Actions"));

const page = (el: ReactNode) => <Suspense fallback={<div className="min-h-screen bg-paper" />}>{el}</Suspense>;

const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  {
    path: "/dashboard",
    element: page(<DashboardLayout />),
    children: [
      { index: true, element: page(<Overview />) },
      { path: "leads", element: page(<Leads />) },
      { path: "leads/:id", element: page(<LeadDetail />) },
      { path: "conversations", element: page(<Conversations />) },
      { path: "appointments", element: page(<Appointments />) },
      { path: "actions", element: page(<Actions />) },
    ],
  },
  { path: "*", element: <Landing /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChatProvider>
      <RouterProvider router={router} />
    </ChatProvider>
  </StrictMode>,
);
