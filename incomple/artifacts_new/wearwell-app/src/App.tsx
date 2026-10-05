// Keep the existing Wearwell experience intact while the app is moved into
// the workspace's runnable web artifact. Its local persistence boundary stays
// in src/storage.js until the authenticated Supabase layer is ready.
import WearwellApp from '../../../src/main.jsx';

export default WearwellApp;
