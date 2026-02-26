import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

describe('Asset Size Budget', () => {
    const MAX_MODEL_SIZE_MB = 2; // 2MB per model
    const MAX_TOTAL_SIZE_MB = 20; // 20MB total for all models

    it('should keep all GLB models under 2MB each', () => {
        const modelsDir = join(process.cwd(), 'public/models');

        if (!existsSync(modelsDir)) {
            throw new Error('public/models/ does not exist');
        }

        const files = readdirSync(modelsDir, { recursive: true }).filter(
            (f): f is string => typeof f === 'string' && f.endsWith('.glb')
        );

        if (files.length === 0) {
            throw new Error('No GLB files found in public/models/');
        }

        const overBudget: string[] = [];

        for (const file of files) {
            const filePath = join(modelsDir, file);
            const stats = statSync(filePath);
            const sizeMB = stats.size / (1024 * 1024);

            if (sizeMB >= MAX_MODEL_SIZE_MB) {
                overBudget.push(`${file}: ${sizeMB.toFixed(2)}MB`);
            }
        }

        expect(overBudget).toEqual([]);
        if (overBudget.length === 0) {
            console.log(`Asset budget OK: All ${files.length} models under ${MAX_MODEL_SIZE_MB}MB`);
        }
    });

    it('should keep total model bundle under 20MB', () => {
        const modelsDir = join(process.cwd(), 'public/models');

        if (!existsSync(modelsDir)) {
            throw new Error('public/models/ does not exist');
        }

        const files = readdirSync(modelsDir, { recursive: true }).filter(
            (f): f is string => typeof f === 'string' && f.endsWith('.glb')
        );

        if (files.length === 0) {
            throw new Error('No GLB files found in public/models/');
        }

        const totalBytes = files.reduce((sum, file) => {
            const filePath = join(modelsDir, file);
            return sum + statSync(filePath).size;
        }, 0);

        const totalMB = totalBytes / (1024 * 1024);

        expect(totalMB).toBeLessThan(MAX_TOTAL_SIZE_MB);
        console.log(`Total model bundle: ${totalMB.toFixed(2)}MB for ${files.length} models`);
    });
});
