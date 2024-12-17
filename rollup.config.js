export default [
    {
        input: 'src/main.js',
        output: [
            {
                file: 'dist/main.js',
                format: 'iife'
            },
            {
                file: 'dist/main.mjs',
                format: 'es'
            }
        ]
    },
    {
        input: 'src/service-worker.js',
        output: {
            file: 'dist/service-worker.js',
            format: 'es'
        }
    }
];