import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Node 24 strips TypeScript. Resolve the extensionless imports used by Vite.
registerHooks({
    resolve(specifier, context, next) {
        if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !/\.[a-z]+$/i.test(specifier)) {
            const url = new URL(specifier + '.ts', context.parentURL);
            if (existsSync(fileURLToPath(url))) return next(url.href, context);
        }
        return next(specifier, context);
    },
});
