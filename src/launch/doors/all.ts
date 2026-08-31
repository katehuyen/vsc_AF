/**
 * EVERY DOOR, REGISTERED ONCE, HERE.
 *
 * Each module exports its door and registers nothing; this file is the only
 * place registerDoor is called. Import order is then a fact of one file rather
 * than an accident of whichever consumer happened to load first - and
 * registering the same id twice throws, because two doors under one id is two
 * places answering for one surface, which is the defect this folder ends.
 */
import { treeRowDoor } from './treeRow';
import { treeMenuDoor } from './treeMenu';
import { launcherDoor } from './launcher';
import { profileDoor } from './profile';
import { composerDoor } from './composer';
import { surfacePickDoor } from './surfacePick';
import { projectsDoor } from './projects';
import { webviewsDoor } from './webviews';
import { paletteDoor } from './palette';
import { bridgeDoor } from './bridge';
import { taskDoor } from './task';
import { automationDoor } from './automation';
import { missionDoor } from './mission';
import { LaunchDoor, registerDoor } from './index';

const ALL: LaunchDoor[] = [
    treeRowDoor,
    treeMenuDoor,
    launcherDoor,
    profileDoor,
    composerDoor,
    surfacePickDoor,
    projectsDoor,
    webviewsDoor,
    paletteDoor,
    bridgeDoor,
    taskDoor,
    automationDoor,
    missionDoor
];

let done = false;
/** Registers the 13 doors. Safe to call more than once. */
export function registerLaunchDoors(): LaunchDoor[] {
    if (!done) { ALL.forEach(registerDoor); done = true; }
    return ALL;
}

export { ALL as ALL_LAUNCH_DOORS };
