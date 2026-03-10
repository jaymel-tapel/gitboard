const { execSync } = require('child_process');

console.log('Setting up GitBoard Docs Agent...\n');

// Check if Ollama is installed
try {
    execSync('which ollama', { stdio: 'pipe' });
} catch {
    console.error('Error: Ollama is not installed. Install it from https://ollama.com');
    process.exit(1);
}

// Pull the nomic-embed-text model for embeddings
console.log('Pulling nomic-embed-text model for document embeddings...');
try {
    execSync('ollama pull nomic-embed-text', { stdio: 'inherit' });
    console.log('\nSetup complete! You can now run: npm run dev');
} catch (error) {
    console.error('Failed to pull nomic-embed-text model:', error.message);
    console.error('Make sure Ollama is running (ollama serve) and try again.');
    process.exit(1);
}
