export type AppMode = 'tree' | 'focus' | 'album';

export type GestureType = 'Open_Palm' | 'Victory' | 'Closed_Fist' | 'None';

export type TreeStyle = 'classic' | 'crayon' | 'geometric';

export type TreeShape = 'tree' | 'snowman' | 'reindeer' | 'santa';

export interface PhotoData {
  id: string;
  url: string;
}

export interface TreeConfig {
  radius: number;
  height: number;
  particleCount: number;
}
