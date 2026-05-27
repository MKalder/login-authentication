import { config } from './config.js';
import app from './app.js';

const PORT = config.port;
console.log(PORT);


app.listen(PORT, () => {
    console.log(`Server runs on: ${PORT}`);
});