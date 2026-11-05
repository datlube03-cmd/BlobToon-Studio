Generate a complete BlobToon script for the topic: "{{TOPIC}}" (target aspect ratio: "{{ASPECT}}").

Return ONLY a JSON object with this exact structure:
{
  "aspect": "{{ASPECT}}",
  "topic": "{{TOPIC}}",
  "title": "Short punchy title",
  "hook": "First 3-second hook sentence",
  "description": "Video description",
  "hashtags": ["#whatif", "#shorts", "#blobtoon", "#animation"],
  "scenes": [
    {
      "id": "scene_hook",
      "label": "THE RULE" | "DAY 1" | "DAY 2" | "DAY 3" | "THE LOOP",
      "narration": "Second-person voiceover text (total across all scenes: 90-130 words)",
      "caption": "Burned-in caption text matching narration",
      "background": "room" | "kitchen" | "school" | "arcade" | "street" | "void",
      "transition": "wipe" | "zoom" | "iris" | "slide",
      "characters": [
        {
          "id": "you",
          "name": "You",
          "color": "#38bdf8",
          "accessory": "none" | "hoodie" | "cap" | "glasses" | "crown" | "headphones" | "bandana" | "bowtie",
          "size": 1.0,
          "x": 0.32,
          "y": 0.62,
          "emotion": "happy" | "sad" | "shock" | "angry" | "smug" | "sleepy" | "laughing",
          "animation": "idle" | "bounce" | "walk" | "jump" | "shake" | "spin" | "slide-in" | "squash-and-stretch" | "scale-pop",
          "speaking": true,
          "flipX": false
        }
      ],
      "props": [
        {
          "id": "prop_1",
          "type": "phone" | "controller" | "clock" | "homework" | "toothbrush" | "door" | "heart" | "trophy",
          "x": 0.5,
          "y": 0.45,
          "scale": 1.1,
          "rotation": 0,
          "animation": "bounce",
          "label": "OPTIONAL SHORT TAG"
        }
      ],
      "beats": [
        {
          "atProgress": 0.25,
          "targetId": "you",
          "emotion": "shock",
          "animation": "jump",
          "bubbleText": "SHORT REACTION!"
        }
      ]
    }
  ]
}
