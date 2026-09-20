// Trusted local template shared by live and demo runs. Observations remain data:
// never interpolate them into executable code or invoke a generation provider.
export const componentModule = `export function render(node) { const el=document.createElement(node.tag); for(const [key,value] of Object.entries(node.attrs)) el.setAttribute(key,value); for(const [key,value] of Object.entries(node.style)) el.style.setProperty(key,value); el.textContent=node.text; return el; }`;
