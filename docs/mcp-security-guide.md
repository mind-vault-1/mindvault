# MCP Security Guide

Treat wallet keys as secrets; never log, echo, or persist raw signing material.
Guard state-changing tools with explicit confirmation and scope-bound authorization.
Validate every payment argument and verify on-chain settlement before granting access.
Set `MINDVAULT_CONFIRM_DESTRUCTIVE_OPERATIONS=all` when agents can reach tools that replace wallet/profile/state data or freeze metadata; those calls then require `confirmDestructive: true`.
