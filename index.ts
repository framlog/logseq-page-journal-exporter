import '@logseq/libs'
import { BlockEntity, PageEntity } from '@logseq/libs/dist/LSPlugin.user'

/**
 * Recursively builds a Markdown string representation of a Logseq block and its children.
 * Handles indentation for nested blocks.
 * @param block The BlockEntity to process.
 * @param indent The current indentation level.
 * @returns A Markdown string for the block and its descendants.
 */
function buildMdBlock(block: BlockEntity, indent: number = 0): string {
  // Format the current block content with indentation.
  let md_content = ''
  let next_indent = indent
  if (block.content.length > 0) {
    md_content = `${' '.repeat(indent * 2)}- ${block.content}\n`
    next_indent = indent + 1
  }
  // Recursively process child blocks, increasing indent.
  block.children?.forEach((child) => {
    // Type Check: Ensure the child is a BlockEntity, not a BlockUUIDTuple.
    if (!Array.isArray(child)) {
      md_content += buildMdBlock(child, next_indent)
    } else {
      // Log a warning if we encounter an unexpected BlockUUIDTuple.
      console.warn("Skipping unexpected BlockUUIDTuple in children:", child);
    }
  })
  return md_content
}

async function buildMd(page: string) {
  // Get the block tree structure for the current page.
  const pageBlocks = await logseq.Editor.getPageBlocksTree(page) as BlockEntity[]

  // Find all pages that link to the current page.
  const linkedReferences = await logseq.Editor.getPageLinkedReferences(page) as Array<[PageEntity, BlockEntity[]]>

  // Calculate the start date of the current week (Monday)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const startOfWeek = new Date(today);
  // Adjust to make Monday the first day (0 becomes 6, 1 becomes 0, ..., 6 becomes 5)
  const daysToSubtract = (dayOfWeek + 6) % 7;
  startOfWeek.setDate(today.getDate() - daysToSubtract);
  // Convert startOfWeek to YYYYMMDD integer format
  const year = startOfWeek.getFullYear();
  const month = (startOfWeek.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
  const day = startOfWeek.getDate().toString().padStart(2, '0');
  const startOfWeekMondayYYYYMMDD = parseInt(`${year}${month}${day}`, 10);

  // Filter linked references to keep only those from journal pages within the current week.
  const journalBlocks = linkedReferences?.filter(([page, _blocks]) => {
    // Check if the page has a `journalDay` property, indicating it's a journal page.
    // TODO(fangxu): figure out when does the page is null.
    if (!page || !page.journalDay) {
      return false;
    }

    // Check if the journal day is within the current week (since Monday)
    return page.journalDay >= startOfWeekMondayYYYYMMDD;
  }).sort((a, b) => {
    // Sort by journalDay in descending order (newest first).
    // Use ?? 0 to provide a default value, ensuring subtraction is valid.
    return (b[0]?.journalDay ?? 0) - (a[0]?.journalDay ?? 0);
  })

  // Build the initial Markdown content from the current page's blocks.
  let md_content = pageBlocks.map(block => buildMdBlock(block)).join('\n')

  // Add a separator and the "Backlog" section header.
  md_content += '----\n' // Horizontal rule
  md_content += '## Backlog\n'

  // Process the filtered journal blocks to append their content.
  md_content += journalBlocks.map(blocks => {
    // `blocks` is a tuple: [JournalPageEntity, ArrayOfBlocksFromThatJournal]
    const [header, journals] = blocks

    // Format the blocks found on each journal page.
    let md_journals = journals.map(block => {
      // Remove links (direct or tagged) to the current page.
      // Example: `[[Page Name]]` or `#[[Page Name]]` are removed.
      block.content = block.content.replace(`#[[${page}]]`, '').replace(`[[${page}]]`, '').trim()
      // Convert the modified journal block (and its children) to Markdown.
      return buildMdBlock(block)
    }).join('\n') // Join the Markdown strings of blocks from the *same* journal page.

    // Reformat the journal date (header.originalName) to remove day suffix (e.g., "th", "nd").
    // Assumes format like "Month DaySuffix, Year" (e.g., "October 26th, 2023").
    let index = header.originalName.search(',') // Find the comma before the year.
    // Extract the part before the suffix (e.g., "October 26") and the part after (e.g., ", 2023").
    let date = header.originalName.slice(0, index - 2) + header.originalName.slice(index)

    // Format the output for this journal day using the reformatted date.
    return `**${date}**\n${md_journals}`
  }).join('\n') // Join the formatted sections from *different* journal pages.

  console.log(md_content)
  // Copy to clipboard.
  // await navigator.clipboard.writeText(md_content)
}

/**
 * Main function for the Logseq plugin.
 */
function main() {
  // Register a command for the page menu.
  logseq.App.registerPageMenuItem('Export page with journals', async (e) => {
    await buildMd(e.page)
  })
}

// Initialize the plugin when Logseq is ready.
logseq.ready(main).catch(console.error)
