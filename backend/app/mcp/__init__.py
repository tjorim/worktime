"""Domain modules for the Worktime FastMCP server.

``app.mcp_server`` is the thin assembler (imports, auth-provider building,
``WorktimeMcpContext``/error types re-exported from ``app.mcp.context``,
tool registration). Each module here holds the actual tool logic for one
domain, as plain async functions the assembler's ``WorktimeMcpBackend``
methods delegate to — mirroring champagnefestival's ``app/mcp/`` package
shape while keeping Worktime's own async-service-reuse and
``_map_domain_errors`` patterns.
"""
