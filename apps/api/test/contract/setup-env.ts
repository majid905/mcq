import 'reflect-metadata';
import { loadDotenv } from '../../src/config/dotenv';

// Files fill in anything CI/containers did not set; real environment variables win.
loadDotenv();
