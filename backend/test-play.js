const play = require('play-dl');

async function test() {
  try {
    const stream = await play.stream('Cl5Vkd4N03Q');
    console.log("SUCCESS");
    console.log(stream.url);
  } catch (err) {
    console.error("FAIL", err);
  }
}

test();
