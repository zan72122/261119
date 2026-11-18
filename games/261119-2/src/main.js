import { core } from './core.js';
import pack from './scene_pack.js';
import trip from './scene_trip.js';
import home from './scene_home.js';
core.register(pack); core.register(trip); core.register(home);
core.start();
