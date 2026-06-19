/**
 * A hand-picked set of reaction GIFs for the match banter, grouped by mood. We
 * store only the Giphy media URL on a message (not bytes) and hotlink the CDN —
 * a broken/removed GIF just hides itself in the UI (onError). No API key, so it
 * works out of the box; a search API can be layered on later for an endless
 * library. IDs were sourced from Giphy's public category pages.
 */
export interface WcGif {
  id: string;
  alt: string;
}

export interface WcGifCategory {
  key: string;
  label: string;
  gifs: WcGif[];
}

/** The direct, hotlinkable Giphy media URL for a GIF id. */
export function gifUrl(id: string): string {
  return `https://media.giphy.com/media/${id}/giphy.gif`;
}

export const WC_GIF_CATEGORIES: WcGifCategory[] = [
  {
    key: 'worldcup',
    label: '⚽ World Cup',
    gifs: [
      { id: '40KfwvNwBjJZuj2OYP', alt: 'Messi celebration' },
      { id: 'SOJBmp8r0wHwUkpYxW', alt: 'Griezmann celebration' },
      { id: '26BRLCZLjrl2vqFQA', alt: 'Goal celebration' },
      { id: 'hrwmeFmQ4K2dCvI8aa', alt: 'Football celebration' },
      { id: 'l3UcicwEsOOan1Q2c', alt: 'Team celebration' },
      { id: 'tLV1b9AHw2kgaexfwh', alt: 'World Cup 2026' },
      { id: 'NIlYDRooUMU9LrSSgl', alt: 'Champions League' },
      { id: 'l0IsHIEqZbGMPEdbO', alt: 'Argentina Messi' },
      { id: 'avaW8GP2Yu6ay4rRLQ', alt: 'Ronaldo celebration' },
      { id: 'kgsqn9gCVAQ3YM3C2f', alt: 'Lifting the trophy' },
      { id: 'MTzgVoz8ZiEZSbeNAb', alt: 'World Cup Messi' },
      { id: '1XcdHqVegT5MQs1r55', alt: 'Pulisic celebration' },
    ],
  },
  {
    key: 'elation',
    label: '🎉 Elation',
    gifs: [
      { id: 'S7Q8eVYii3z1Ak0N5B', alt: 'Get in!' },
      { id: 'VIQQi366J7dC1R5b8n', alt: 'Fans going wild' },
      { id: 'F6PFPjc3K0CPe', alt: 'Excited' },
      { id: '31lPv5L3aIvTi', alt: 'So excited' },
      { id: 'hZj44bR9FVI3K', alt: 'Yay!' },
      { id: 'IwAZ6dvvvaTtdI8SD5', alt: 'Celebrating' },
      { id: '5UAofAl6g5t1GL5nO8', alt: "Let's go!" },
      { id: '9LwJDCZHrLGw2UQLRm', alt: 'Hyped up' },
      { id: '7yORCExjS87Jk10xSU', alt: 'Yes yay!' },
      { id: 'RrVzUOXldFe8M', alt: 'Nicolas Cage yes' },
      { id: 'g8MEg50S6p2HHiyfVt', alt: 'Goooo!' },
      { id: 'LoCDk7fecj2dwCtSB3', alt: 'Bring it on' },
    ],
  },
  {
    key: 'lol',
    label: '😂 Lol',
    gifs: [
      { id: 'XHeLeuirRbwptHhSWd', alt: 'Laughing' },
      { id: '12msOFU8oL1eww', alt: 'Cracking up' },
      { id: 'Hm8qQxDIgbFsjL9msa', alt: 'Hahaha' },
      { id: 'fUYhyT9IjftxrxJXcE', alt: 'LOL' },
      { id: 'Tq2tPTrQANKfK', alt: 'Hehe' },
      { id: 'ZqlvCTNHpqrio', alt: 'Minions laughing' },
      { id: 'NIDo2a11C55fPDiUcx', alt: 'Crying laughing' },
      { id: 'gj0QdZ9FgqGhOBNlFS', alt: 'Lmao' },
      { id: 'En8fsYde6cqvhYBnAb', alt: 'Haha' },
      { id: '3o6ozvv0zsJskzOCbu', alt: 'Dying laughing' },
      { id: 'aqqUwXz7j0xMOKnJgb', alt: 'Hilarious' },
      { id: '3i7zenReaUuI0', alt: 'Scrubs laughing' },
    ],
  },
  {
    key: 'shook',
    label: '😱 Shook',
    gifs: [
      { id: 'LpYLocCLqJ9nKqt0PB', alt: 'Excuse me?!' },
      { id: 'QUENDfi6DEMLzQ0CKt', alt: 'Oh really wow' },
      { id: 'dAVLtOPb0JeIE', alt: 'Shocked' },
      { id: 'eC9XEJUZHlD99uM7Tu', alt: 'Gasp' },
      { id: 'MBchOyOFof4tfmxrD8', alt: 'Scared monkey' },
      { id: 'QOAA3I4EezWzXJNY2M', alt: 'Shocked turtle' },
      { id: 'PUBxelwT57jsQ', alt: 'Shocked cat' },
      { id: '3o72F8t9TDi2xVnxOE', alt: 'Stunned' },
      { id: 'ep78UZy5FVbfN6mhCU', alt: 'Eek!' },
    ],
  },
  {
    key: 'onedge',
    label: '😬 On edge',
    gifs: [
      { id: 'xUOxfgpZFJmCgHy5UY', alt: 'Nail biting' },
      { id: '7zSBli5e72PVGxcDtf', alt: 'Anxious wait' },
      { id: '3oz8xLlw6GHVfokaNW', alt: 'Nervous' },
      { id: 'snEeOh54kCFxe', alt: 'On the edge of my seat' },
      { id: '3ohc15hpGuLpSTx960', alt: 'Tense' },
      { id: 'popzuso6beJ33LebHI', alt: 'Nervously waiting' },
      { id: 'yAsfK4UZ4J8UpejGbp', alt: 'Anxious' },
      { id: 'yn5xhQX92xTsv8m9lU', alt: 'Holding my breath' },
    ],
  },
  {
    key: 'fuming',
    label: '😤 Fuming',
    gifs: [
      { id: 'Xbh3RSUbOpH1u', alt: 'Table flip' },
      { id: 'v7wdD79z33oUJBM0Iz', alt: 'Smashing things' },
      { id: '3ohs81rDuEz9ioJzAA', alt: 'Raging at the screen' },
      { id: 'jdiJDXdnEa88j1oBTQ', alt: 'Furious' },
      { id: 'rKCUYdpnhwS8qCpCIY', alt: 'Angry cat' },
      { id: 'okrv1eWeKVM9W', alt: 'Anger' },
      { id: 'hbcorXlnIJySI', alt: 'Funny rage' },
      { id: 'vHcCevWbWkzwk', alt: 'Mad' },
      { id: 'AzdZrT9OGEIyQ', alt: 'Pure rage' },
      { id: 'bYQpWfvC5zIRv6hUsl', alt: 'Hulk smash' },
      { id: 'Zh03CNl9ghWpcYDHOm', alt: 'Rage quit' },
      { id: 'EtB1yylKGGAUg', alt: 'Panda rage' },
    ],
  },
  {
    key: 'robbed',
    label: '🤬 Robbed',
    gifs: [
      { id: 'imi43u7Buh6BJj58p5', alt: 'Facepalm' },
      { id: '9DJtFRgk0tOla', alt: 'Stallone facepalm' },
      { id: '26ueYUlPAmUkTBAM8', alt: 'Are you kidding me' },
      { id: '10o3Um2U3wa4DK', alt: 'Seinfeld frustrated' },
      { id: '3og0INyCmHlNylks9O', alt: 'Classic facepalm' },
      { id: 'XD4qHZpkyUFfq', alt: 'Facepalm' },
      { id: 'vwI4mYEHP8k0w', alt: 'Muppets annoyed' },
      { id: '3xz2BLBOt13X9AgjEA', alt: 'No way, facepalm' },
      { id: 'wMvESGxZ0Cqd2', alt: 'Ryan Gosling frustrated' },
      { id: 'VZXJyfOqpvuiIw3oJM', alt: 'Spider-Man facepalm' },
      { id: '6yRVg0HWzgS88', alt: 'Simon Cowell facepalm' },
    ],
  },
  {
    key: 'gutted',
    label: '😭 Gutted',
    gifs: [
      { id: '1BXa2alBjrCXC', alt: 'Crying' },
      { id: '2WxWfiavndgcM', alt: 'Sobbing' },
      { id: '6Q3M4BIK0lX44', alt: 'Tears' },
      { id: 'd7rvF20PqNuGKSQGhf', alt: 'Devastated' },
      { id: 'G6IATw3N0jhIc', alt: 'Crying' },
      { id: '10tIjpzIu8fe0', alt: 'Inside Out sad' },
      { id: '3QWfMsI8IaarXxtBt6', alt: 'Crying' },
      { id: 'p4w0AMZJa2EtG', alt: 'Ugly crying' },
      { id: 'hppWdK8gcmzXq', alt: 'Spider-Man crying' },
      { id: 'hDKD6z2xNeMesbICNS', alt: 'Praying through tears' },
      { id: 'P53TSsopKicrm', alt: 'Sad crying' },
    ],
  },
  {
    key: 'bored',
    label: '🥱 Bored',
    gifs: [
      { id: '4WFFxEKr5rStT6fbSd', alt: 'Yawn' },
      { id: '3d5O10XObbr8LW4bDY', alt: 'So boring' },
      { id: 'QvssBRVtE4rJK', alt: 'Unimpressed' },
      { id: 'vgzwlRwU47uAVfydgX', alt: 'Bored sigh' },
      { id: 'et2rkCm8vvF06UtqbR', alt: 'Sleepy cat' },
      { id: '3o6ZtokgzQv6ThHzj2', alt: 'Over it' },
      { id: 'F3BeiZNq6VbDwyxzxF', alt: 'The Office bored' },
      { id: 'lOyrV272nGT5l6vRcb', alt: 'Nothing much' },
      { id: 'MIY4jpusckRmU', alt: 'Bored Monday' },
      { id: 'dT7LBdAZP1Rh6', alt: 'Bored cat' },
      { id: 'LTYT5GTIiAMBa', alt: 'Boring' },
      { id: 'RKS1pHGiUUZ2g', alt: 'Monsters Inc bored' },
    ],
  },
];
