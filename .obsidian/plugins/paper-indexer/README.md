Research Assistant (Paper Indexer) – Notes

Troubleshooting chat panel

- Fixed: An issue where opening the chat could show a blank message from "Assistant"/"You" due to old saved conversations with empty content or non-Date timestamps.
- The chat view now:
	- Normalizes and filters out empty messages on load.
	- Safely parses timestamps saved as strings.
	- Prevents saving typing placeholders and stores timestamps as ISO strings.

If you still see a blank message once after upgrading, press "Clear Chat" for that note to purge old persisted data, then continue normally.

