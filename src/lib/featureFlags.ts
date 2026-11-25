export const isWipPagesEnabled = (): boolean => {
  // Disabled by default unless explicitly enabled via environment variable
  return process.env.ENABLE_WIP_PAGES === "true";
};

export const isMcpServerEnabled = (): boolean => {
  // Enabled by default unless explicitly disabled via environment variable
  return process.env.ENABLE_MCP_SERVER !== "false";
};
