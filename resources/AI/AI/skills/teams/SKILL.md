---
name: teams
description: "Use when: building or debugging Microsoft Teams connector flows in a Power Apps Code App, including teams, channels, chats, mentions, notifications, message posting, or the Teams HttpRequest helper."
---

# Microsoft Teams Connector Guide

> Agent limitation: do not use CLI commands directly from chat for Teams setup. Use the built-in Sync Connections and Deploy buttons instead.

## Core Rule

The wrapper in `dev files/teams.js` is the repo-local source of truth.

- It retries `teams`, `Teams`, `microsoftteams`, and `MicrosoftTeams`.
- It includes inline metadata for the operations it exposes.
- There is no need to guess connector paths when the helper already defines them.

## power.config.json

Prefer a connection reference whose `dataSources` array includes `teams`.

The connection-reference object key can still be an environment-specific id, but the data-source name exposed to the connector should stay aligned with the wrapper.

## Public Helper Surface

The wrapper exports:

- `listTeams()`
- `listChannels(teamId)`
- `getTeam(teamId)`
- `getChannelDetails(teamId, channelId)`
- `addMemberToTeam(teamId, body)`
- `addMemberToChannel(teamId, channelId, body)`
- `getUserMentionToken(userId)`
- `getTeamTagMentionToken(teamId, tagId)`
- `listChats({ top, skip })`
- `listMembers(teamId, channelId)`
- `postFeedNotification({ groupId, body })`
- `postCardInChatOrChannel({ poster, location, body })`
- `postMessageInChatOrChannel({ poster, location, body })`
- `sendTeamsGraphHttpRequest({ method, uri, headers, body })`
- `callTeamsOperation(operationName, parameters)`

## Important Wrapper Behavior

- `postFeedNotification(...)` chooses `PostChannelNotification` when `groupId` is present and `PostUserNotification` otherwise.
- Chat pagination uses `$top` and `$skip`.
- Mention helpers return the connector-formatted mention token payload; do not hand-roll those shapes.
- `sendTeamsGraphHttpRequest(...)` still uses the Teams connector `HttpRequest` action, not direct Graph auth.

## Debugging

- If the failure mentions missing `path`, the operation name does not match the inline Teams metadata.
- If the failure mentions connection reference lookup, confirm the app exposes `teams` in `power.config.json`.
- Keep the wrapper candidate names intact when supporting older apps.