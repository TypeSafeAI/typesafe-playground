export const demoExamples = [
  {
    id: "catalog",
    title: "Searchable catalog",
    description:
      "Discover a product list and search API. Rebuild reusable cards, submit a search, and compare results.",
    goal: "Rebuild the catalog, search for Cloud, and verify the matching product and query request.",
  },
  {
    id: "contacts",
    title: "Contacts CRUD",
    description:
      "Map list, create, update, and delete endpoints. Rebuild forms and verify the complete contact lifecycle.",
    goal: "Add Grace, rename Ada to Katherine, delete Grace, and verify the remaining contact list.",
  },
  {
    id: "support",
    title: "Support ticket",
    description:
      "Map a two-field form to a JSON endpoint. Submit a ticket and verify the confirmation response.",
    goal: "Submit a support ticket for val@example.test about account access and verify ticket S-101.",
  },
] as const;
export type DemoId = (typeof demoExamples)[number]["id"];
export const demoConfigs = {
  catalog: {
    openapi: "/openapi/catalog",
    screens: [
      {
        id: "catalog",
        path: "/catalog",
        readyText: "Cloud notebook",
        scenarios: [
          {
            id: "search",
            actions: [
              {
                kind: "fill",
                role: "textbox",
                name: "Search products",
                value: "Cloud",
              },
              { kind: "click", role: "button", name: "Search" },
            ],
            expectText: "Cloud notebook",
          },
        ],
      },
    ],
  },
  contacts: {
    openapi: "/openapi/contacts",
    screens: [
      {
        id: "contacts",
        path: "/contacts",
        readyText: "Ada",
        scenarios: [
          {
            id: "lifecycle",
            actions: [
              {
                kind: "fill",
                role: "textbox",
                name: "New contact name",
                value: "Grace",
              },
              { kind: "click", role: "button", name: "Add contact" },
              {
                kind: "fill",
                role: "textbox",
                name: "Update contact ID",
                value: "1",
              },
              {
                kind: "fill",
                role: "textbox",
                name: "Updated name",
                value: "Katherine",
              },
              { kind: "click", role: "button", name: "Update contact" },
              {
                kind: "fill",
                role: "textbox",
                name: "Delete contact ID",
                value: "3",
              },
              { kind: "click", role: "button", name: "Delete contact" },
            ],
            expectText: "Katherine",
          },
        ],
      },
    ],
  },
  support: {
    openapi: "/openapi/support",
    screens: [
      {
        id: "support",
        path: "/support",
        readyText: "Contact support",
        scenarios: [
          {
            id: "submit",
            actions: [
              {
                kind: "fill",
                role: "textbox",
                name: "Email",
                value: "val@example.test",
              },
              {
                kind: "fill",
                role: "textbox",
                name: "Message",
                value: "Please help with account access.",
              },
              { kind: "click", role: "button", name: "Send ticket" },
            ],
            expectText: "S-101",
          },
        ],
      },
    ],
  },
} as const;
