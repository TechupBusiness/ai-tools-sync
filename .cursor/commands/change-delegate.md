Output all file changes in a single codeblock using this format:

=== CREATE <filepath> ===
<full file content>

=== ADD TO <filepath> (after <marker>) ===
<content to add>

=== REPLACE IN <filepath> (<line range or marker>) ===
<new content>

Rules:
- One codeblock for all changes
- No nested codeblocks inside
- Use exact file paths
- Include location hints for partial changes