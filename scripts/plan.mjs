#!/usr/bin/env node
import {
  formatNext, formatStatus, getStatus, loadRoadmap, SCOPE_NOTE,
} from './lib/roadmap.mjs';

const [command, ...extra] = process.argv.slice(2);
const usage = 'Usage: node scripts/plan.mjs check|status|next';

if (command === '--help' && extra.length === 0) {
  console.log(usage);
} else if (!['check', 'status', 'next'].includes(command) || extra.length > 0) {
  console.error(usage);
  process.exitCode = 2;
} else {
  try {
    const roadmap = loadRoadmap();
    if (command === 'check') {
      console.log('Roadmap valid: ' + roadmap.tasks.length + ' tasks across ' +
        roadmap.milestones.length + ' milestones; graph and local references checked.');
      console.log(SCOPE_NOTE);
    } else if (command === 'status') {
      console.log(formatStatus(roadmap));
    } else {
      console.log(formatNext(getStatus(roadmap)));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
