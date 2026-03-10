import { FileSystemManager } from '../file-system';
import type { DocPage } from '../schemas';
import type { FileManager } from './file-manager';

/**
 * Docs Manager
 *
 * Handles all docs page operations: create, read, update, delete, list
 * Pages can be organized into folders
 */
export class DocsManager {
    private fileManager?: FileManager;

    constructor(
        private fs: FileSystemManager,
        private getCurrentUser: () => string
    ) {}

    /**
     * Set the FileManager for cascade deletion of files
     */
    setFileManager(fileManager: FileManager): void {
        this.fileManager = fileManager;
    }

    /**
     * Create a new doc page
     */
    async create(
        slug: string,
        folder: string,
        data: Omit<DocPage, 'slug' | 'folder' | 'metadata'>
    ): Promise<DocPage> {
        const now = new Date().toISOString();
        const user = this.getCurrentUser();

        const docPage: DocPage = {
            slug,
            folder,
            ...data,
            metadata: {
                created_at: now,
                updated_at: now,
                created_by: user,
                updated_by: user,
            },
        };

        await this.fs.writeDocPage(docPage);
        return docPage;
    }

    /**
     * Read a doc page
     */
    async read(folder: string, slug: string): Promise<DocPage> {
        return this.fs.readDocPage(folder, slug);
    }

    /**
     * Update a doc page
     */
    async update(
        folder: string,
        slug: string,
        updates: Partial<Omit<DocPage, 'slug' | 'folder' | 'metadata'>>
    ): Promise<DocPage> {
        const docPage = await this.read(folder, slug);
        const user = this.getCurrentUser();

        const updatedDocPage: DocPage = {
            ...docPage,
            ...updates,
            slug: docPage.slug,
            folder: docPage.folder,
            metadata: {
                ...docPage.metadata,
                updated_at: new Date().toISOString(),
                updated_by: user,
            },
        };

        await this.fs.writeDocPage(updatedDocPage);
        return updatedDocPage;
    }

    /**
     * Move a doc page to a different folder
     */
    async move(
        oldFolder: string,
        newFolder: string,
        slug: string
    ): Promise<DocPage> {
        const docPage = await this.read(oldFolder, slug);
        const user = this.getCurrentUser();

        await this.fs.moveDocPage(oldFolder, newFolder, slug);

        const updatedDocPage: DocPage = {
            ...docPage,
            folder: newFolder,
            metadata: {
                ...docPage.metadata,
                updated_at: new Date().toISOString(),
                updated_by: user,
            },
        };

        await this.fs.writeDocPage(updatedDocPage);
        return updatedDocPage;
    }

    /**
     * Delete a doc page and its associated files
     */
    async delete(folder: string, slug: string): Promise<void> {
        // Build the doc ID for file association (folder/slug format)
        const docId = folder ? `${folder}/${slug}` : slug;

        // Cascade delete associated files if FileManager is available
        if (this.fileManager) {
            try {
                await this.fileManager.deleteByParent('doc', docId);
            } catch (error) {
                // Log warning but don't fail doc deletion if file cleanup fails
                console.warn(`Warning: Failed to delete files for doc ${docId}:`, error);
            }
        }

        await this.fs.deleteDocPage(folder, slug);
    }

    /**
     * List all doc pages
     */
    async list(): Promise<DocPage[]> {
        const pageRefs = await this.fs.listDocsPages();
        const pages: DocPage[] = [];

        for (const ref of pageRefs) {
            try {
                const page = await this.read(ref.folder, ref.slug);
                pages.push(page);
            } catch (error) {
                console.error(`Failed to read doc page ${ref.folder}/${ref.slug}:`, error);
            }
        }

        return pages.sort((a, b) => {
            const folderA = a.folder || '';
            const folderB = b.folder || '';

            if (folderA !== folderB) {
                if (!folderA) return -1;
                if (!folderB) return 1;
                return folderA.localeCompare(folderB);
            }
            return a.title.localeCompare(b.title);
        });
    }

    /**
     * List all folders
     */
    async listFolders(): Promise<string[]> {
        return this.fs.listDocsFolders();
    }

    /**
     * Create a folder
     */
    async createFolder(folderName: string): Promise<void> {
        await this.fs.createDocsFolder(folderName);
    }

    /**
     * Rename a folder
     */
    async renameFolder(oldName: string, newName: string): Promise<void> {
        const pages = await this.list();
        const folderPages = pages.filter((p) => p.folder === oldName);

        await this.fs.renameDocsFolder(oldName, newName);

        for (const page of folderPages) {
            const updatedPage = { ...page, folder: newName };
            await this.fs.writeDocPage(updatedPage);
        }
    }

    /**
     * Delete a folder
     */
    async deleteFolder(folderName: string, force: boolean = false): Promise<void> {
        const isEmpty = await this.fs.isDocsFolderEmpty(folderName);

        if (!isEmpty && !force) {
            throw new Error(
                'Folder is not empty. Use force=true to delete all pages inside.'
            );
        }

        if (!isEmpty && force) {
            const pages = await this.list();
            const folderPages = pages.filter((p) => p.folder === folderName);
            for (const page of folderPages) {
                await this.delete(folderName, page.slug);
            }
        }

        await this.fs.deleteDocsFolder(folderName);
    }

    /**
     * Find doc pages by tag
     */
    async findByTag(tag: string): Promise<DocPage[]> {
        const pages = await this.list();
        return pages.filter((page) => page.tags.includes(tag));
    }

    /**
     * Search doc pages by title or content
     */
    async search(query: string): Promise<DocPage[]> {
        const pages = await this.list();
        const lowerQuery = query.toLowerCase();

        return pages.filter(
            (page) =>
                page.title.toLowerCase().includes(lowerQuery) ||
                page.content.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Check if a doc page exists
     */
    async exists(folder: string, slug: string): Promise<boolean> {
        try {
            await this.read(folder, slug);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Generate a unique slug from a title
     */
    async generateSlug(title: string, folder: string = ''): Promise<string> {
        const baseSlug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        let slug = baseSlug;
        let counter = 1;

        while (await this.exists(folder, slug)) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        return slug;
    }
}
