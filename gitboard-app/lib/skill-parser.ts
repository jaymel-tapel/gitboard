import { Skill, SkillSchema } from './schemas';

/**
 * Parse a SKILL.md file content into a Skill object
 * The file format is:
 * ---
 * name: Skill Name
 * description: Skill description
 * license: MIT
 * version: 1.0.0
 * compatibility:
 *   agents: [claude-code, cursor]
 *   providers: [anthropic, openai]
 * metadata:
 *   created_at: ISO date
 *   updated_at: ISO date
 *   created_by: user
 *   updated_by: user
 * ---
 *
 * # Instructions
 *
 * Markdown content here...
 */
export function parseSkillMarkdown(content: string, id: string): Skill {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
        // No frontmatter, treat entire content as instructions
        const now = new Date().toISOString();
        return SkillSchema.parse({
            id,
            name: id,
            instructions: content.trim(),
            metadata: {
                created_at: now,
                updated_at: now,
                created_by: 'GitBoard User',
                updated_by: 'GitBoard User',
            },
        });
    }

    const [, frontmatterStr, instructionsContent] = frontmatterMatch;
    const frontmatter = parseYamlFrontmatter(frontmatterStr!);

    return SkillSchema.parse({
        id,
        name: frontmatter.name || id,
        description: frontmatter.description,
        license: frontmatter.license,
        version: frontmatter.version,
        compatibility: frontmatter.compatibility,
        instructions: instructionsContent?.trim() || '',
        metadata: frontmatter.metadata || {
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: 'GitBoard User',
            updated_by: 'GitBoard User',
        },
    });
}

/**
 * Serialize a Skill object to SKILL.md format
 */
export function serializeSkillMarkdown(skill: Skill): string {
    const frontmatter: Record<string, unknown> = {
        name: skill.name,
    };

    if (skill.description) {
        frontmatter.description = skill.description;
    }

    if (skill.license) {
        frontmatter.license = skill.license;
    }

    if (skill.version) {
        frontmatter.version = skill.version;
    }

    if (skill.compatibility && (skill.compatibility.agents.length > 0 || skill.compatibility.providers.length > 0)) {
        frontmatter.compatibility = skill.compatibility;
    }

    frontmatter.metadata = skill.metadata;

    const yamlStr = serializeToYaml(frontmatter);

    return `---\n${yamlStr}---\n\n${skill.instructions}`;
}

/**
 * Simple YAML parser for frontmatter
 * Handles basic key: value, arrays, and nested objects
 */
function parseYamlFrontmatter(yaml: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = yaml.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i]!;

        // Skip empty lines
        if (!line.trim()) {
            i++;
            continue;
        }

        // Match key: value pattern
        const keyMatch = line.match(/^(\w+):\s*(.*)$/);
        if (keyMatch) {
            const [, key, value] = keyMatch;

            if (!value?.trim()) {
                // Check if next lines are indented (nested object or array)
                const nestedContent: string[] = [];
                i++;
                while (i < lines.length && lines[i]!.match(/^  /)) {
                    nestedContent.push(lines[i]!.substring(2));
                    i++;
                }

                if (nestedContent.length > 0) {
                    // Check if it's an array
                    if (nestedContent[0]!.startsWith('- ')) {
                        result[key!] = nestedContent.map(l => l.replace(/^- /, '').trim());
                    } else {
                        // Nested object
                        result[key!] = parseYamlFrontmatter(nestedContent.join('\n'));
                    }
                }
            } else {
                // Simple value - could be inline array
                if (value.startsWith('[') && value.endsWith(']')) {
                    // Inline array: [item1, item2]
                    const arrayContent = value.slice(1, -1);
                    result[key!] = arrayContent.split(',').map(s => s.trim());
                } else {
                    result[key!] = value.trim();
                }
            }
        }
        i++;
    }

    return result;
}

/**
 * Simple YAML serializer for frontmatter
 */
function serializeToYaml(obj: Record<string, unknown>, indent: number = 0): string {
    let result = '';
    const prefix = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null) continue;

        if (Array.isArray(value)) {
            if (value.length === 0) continue;
            result += `${prefix}${key}:\n`;
            for (const item of value) {
                result += `${prefix}  - ${item}\n`;
            }
        } else if (typeof value === 'object') {
            result += `${prefix}${key}:\n`;
            result += serializeToYaml(value as Record<string, unknown>, indent + 1);
        } else {
            result += `${prefix}${key}: ${value}\n`;
        }
    }

    return result;
}
