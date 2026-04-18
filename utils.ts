import { App, TFile, arrayBufferToBase64 } from 'obsidian';

export interface ImageContent {
    mimeType: string;
    base64: string;
}

export async function extractImagesFromMarkdown(app: App, content: string, sourcePath: string): Promise<ImageContent[]> {
    const images: ImageContent[] = [];
    const maxImages = 5; // limit to prevent payload bloat

    // Regex for ![[image.png]] and ![alt](image.png)
    const wikilinkRegex = /!\[\[(.*?)\]\]/g;
    const mdlinkRegex = /!\[.*?\]\((.*?)\)/g;

    const links = new Set<string>();

    let match;
    while ((match = wikilinkRegex.exec(content)) !== null) {
        links.add(match[1]);
    }
    while ((match = mdlinkRegex.exec(content)) !== null) {
        links.add(match[1]);
    }

    let count = 0;
    for (const link of links) {
        if (count >= maxImages) break;
        // Strip out any anchor # or alias |
        const cleanLink = link.split('#')[0].split('|')[0];

        const file = app.metadataCache.getFirstLinkpathDest(cleanLink, sourcePath);
        if (file instanceof TFile && file.extension.match(/^(png|jpe?g|webp|gif)$/i)) {
            const arrayBuffer = await app.vault.readBinary(file);
            const base64 = arrayBufferToBase64(arrayBuffer);
            const mimeType = getMimeType(file.extension);
            images.push({ mimeType, base64 });
            count++;
        }
    }

    return images;
}

export function getMimeType(extension: string): string {
    switch (extension.toLowerCase()) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        case 'gif': return 'image/gif';
        default: return 'application/octet-stream';
    }
}
