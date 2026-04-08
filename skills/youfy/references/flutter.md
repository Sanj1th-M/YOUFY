# Youfy Flutter — Full Code Reference

Framework: Flutter >=3.10.0 | Language: Dart | Platforms: Android + iOS

---

## pubspec.yaml

```yaml
name: youfy
description: Free ad-free music streaming app
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter

  # Audio
  just_audio: ^0.9.36
  audio_service: ^0.18.12
  audio_session: ^0.1.18

  # State management
  flutter_riverpod: ^2.4.0
  riverpod_annotation: ^2.3.3

  # Navigation
  go_router: ^13.0.0

  # HTTP
  dio: ^5.4.0

  # Local storage
  hive_flutter: ^1.1.0

  # Images
  cached_network_image: ^3.3.0

  # Firebase
  firebase_core: ^2.24.0
  firebase_auth: ^4.15.0
  cloud_firestore: ^4.13.0

  # UI
  flutter_slidable: ^3.0.1
  shimmer: ^3.0.0
  palette_generator: ^0.3.3

flutter:
  uses-material-design: true
```

---

## lib/main.dart

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'firebase_options.dart';
import 'core/router/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await Hive.initFlutter();
  runApp(const ProviderScope(child: YoufyApp()));
}

class YoufyApp extends ConsumerWidget {
  const YoufyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Youfy',
      theme: ThemeData.dark().copyWith(
        colorScheme: ColorScheme.dark(primary: Colors.greenAccent.shade400),
      ),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
```

---

## lib/core/constants/api_constants.dart

```dart
class ApiConstants {
  // Replace with your Oracle server IP in production
  // Android emulator: use 10.0.2.2
  // Physical device testing: use your machine's local IP
  static const String baseUrl = 'http://YOUR_ORACLE_IP:3000';
}
```

---

## lib/core/router/app_router.dart

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../screens/splash/splash_screen.dart';
import '../../screens/auth/login_screen.dart';
import '../../screens/auth/register_screen.dart';
import '../../screens/home/home_screen.dart';
import '../../screens/search/search_screen.dart';
import '../../screens/player/player_screen.dart';
import '../../screens/library/library_screen.dart';
import '../../screens/profile/profile_screen.dart';
import '../../providers/auth_provider.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      final isLoggedIn = authState.valueOrNull != null;
      final isAuthRoute = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register' ||
          state.matchedLocation == '/splash';

      if (!isLoggedIn && !isAuthRoute) return '/login';
      if (isLoggedIn && (state.matchedLocation == '/login' ||
          state.matchedLocation == '/register')) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/splash',   builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login',    builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
      GoRoute(path: '/home',     builder: (_, __) => const HomeScreen()),
      GoRoute(path: '/search',   builder: (_, __) => const SearchScreen()),
      GoRoute(path: '/player',   builder: (_, __) => const PlayerScreen()),
      GoRoute(path: '/library',  builder: (_, __) => const LibraryScreen()),
      GoRoute(path: '/profile',  builder: (_, __) => const ProfileScreen()),
    ],
  );
});
```

---

## lib/models/song.dart

```dart
class Song {
  final String videoId;
  final String title;
  final String artist;
  final String? thumbnail;
  final int? duration; // seconds

  const Song({
    required this.videoId,
    required this.title,
    required this.artist,
    this.thumbnail,
    this.duration,
  });

  factory Song.fromJson(Map<String, dynamic> json) => Song(
    videoId:   json['videoId']   as String,
    title:     json['title']     as String,
    artist:    json['artist']    as String,
    thumbnail: json['thumbnail'] as String?,
    duration:  json['duration']  as int?,
  );

  Map<String, dynamic> toJson() => {
    'videoId':   videoId,
    'title':     title,
    'artist':    artist,
    'thumbnail': thumbnail,
    'duration':  duration,
  };
}
```

---

## lib/models/playlist.dart

```dart
import 'song.dart';

class Playlist {
  final String id;
  final String name;
  final List<Song> songs;
  final DateTime createdAt;

  const Playlist({
    required this.id,
    required this.name,
    required this.songs,
    required this.createdAt,
  });

  factory Playlist.fromJson(Map<String, dynamic> json) => Playlist(
    id:        json['id']   as String,
    name:      json['name'] as String,
    songs:     (json['songs'] as List? ?? [])
                   .map((s) => Song.fromJson(s as Map<String, dynamic>))
                   .toList(),
    createdAt: (json['createdAt'] is String)
        ? DateTime.parse(json['createdAt'])
        : DateTime.now(),
  );
}
```

---

## lib/services/api_service.dart

```dart
import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../core/constants/api_constants.dart';
import '../models/song.dart';
import '../models/playlist.dart';

class ApiService {
  late final Dio _dio;

  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl:        ApiConstants.baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
    ));

    // Inject Firebase token on every request
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final user = FirebaseAuth.instance.currentUser;
        if (user != null) {
          final token = await user.getIdToken();
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
    ));
  }

  // Search
  Future<Map<String, dynamic>> search(String query) async {
    final res = await _dio.get('/search', queryParameters: {'q': query});
    return res.data as Map<String, dynamic>;
  }

  // Get stream URL — NEVER cache this, always fetch fresh
  Future<String> getStreamUrl(String videoId) async {
    final res = await _dio.get('/stream/$videoId');
    return (res.data as Map<String, dynamic>)['url'] as String;
  }

  // Get trending songs
  Future<List<Song>> getTrending() async {
    final res  = await _dio.get('/trending');
    final list = (res.data as Map<String, dynamic>)['songs'] as List;
    return list.map((s) => Song.fromJson(s as Map<String, dynamic>)).toList();
  }

  // Get lyrics
  Future<Map<String, dynamic>> getLyrics(String title, String artist) async {
    final res = await _dio.get('/lyrics',
      queryParameters: {'title': title, 'artist': artist});
    return res.data as Map<String, dynamic>;
  }

  // Playlists
  Future<List<Playlist>> getPlaylists() async {
    final res  = await _dio.get('/playlist');
    final list = (res.data as Map<String, dynamic>)['playlists'] as List;
    return list.map((p) => Playlist.fromJson(p as Map<String, dynamic>)).toList();
  }

  Future<void> createPlaylist(String name) async {
    await _dio.post('/playlist', data: {'name': name});
  }

  Future<void> deletePlaylist(String id) async {
    await _dio.delete('/playlist/$id');
  }

  Future<void> addSongToPlaylist(String playlistId, Song song) async {
    await _dio.post('/playlist/$playlistId/song', data: song.toJson());
  }

  Future<void> removeSongFromPlaylist(String playlistId, String videoId) async {
    await _dio.delete('/playlist/$playlistId/song/$videoId');
  }
}
```

---

## lib/services/auth_service.dart

```dart
import 'package:firebase_auth/firebase_auth.dart';

class AuthService {
  final _auth = FirebaseAuth.instance;

  Stream<User?> get authStateChanges => _auth.authStateChanges();
  User? get currentUser => _auth.currentUser;

  Future<UserCredential> signIn(String email, String password) =>
      _auth.signInWithEmailAndPassword(email: email, password: password);

  Future<UserCredential> register(String email, String password) =>
      _auth.createUserWithEmailAndPassword(email: email, password: password);

  Future<void> signOut() => _auth.signOut();

  Future<String?> getToken() async {
    return await _auth.currentUser?.getIdToken();
  }
}
```

---

## lib/services/audio_handler.dart

```dart
import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';

class YoufyAudioHandler extends BaseAudioHandler with QueueHandler, SeekHandler {
  final _player = AudioPlayer();

  YoufyAudioHandler() {
    _player.playbackEventStream.map(_transformEvent).pipe(playbackState);
    _player.currentIndexStream.listen((index) {
      if (index != null && queue.value.isNotEmpty) {
        mediaItem.add(queue.value[index]);
      }
    });
  }

  Future<void> playFromUrl(String url, MediaItem item) async {
    mediaItem.add(item);
    await _player.setUrl(url);
    await _player.play();
  }

  @override Future<void> play()  => _player.play();
  @override Future<void> pause() => _player.pause();
  @override Future<void> stop()  async {
    await _player.stop();
    await super.stop();
  }
  @override Future<void> seek(Duration position) => _player.seek(position);

  @override
  Future<void> skipToNext() async {
    await _player.seekToNext();
  }

  @override
  Future<void> skipToPrevious() async {
    await _player.seekToPrevious();
  }

  PlaybackState _transformEvent(PlaybackEvent event) {
    return PlaybackState(
      controls: [
        MediaControl.skipToPrevious,
        _player.playing ? MediaControl.pause : MediaControl.play,
        MediaControl.skipToNext,
      ],
      systemActions: const {MediaAction.seek},
      androidCompactActionIndices: const [0, 1, 2],
      processingState: {
        ProcessingState.idle:       AudioProcessingState.idle,
        ProcessingState.loading:    AudioProcessingState.loading,
        ProcessingState.buffering:  AudioProcessingState.buffering,
        ProcessingState.ready:      AudioProcessingState.ready,
        ProcessingState.completed:  AudioProcessingState.completed,
      }[_player.processingState]!,
      playing:  _player.playing,
      updatePosition: _player.position,
      bufferedPosition: _player.bufferedPosition,
      speed: _player.speed,
      queueIndex: _player.currentIndex,
    );
  }

  Stream<Duration> get positionStream => _player.positionStream;
  Duration get position => _player.position;
  bool get playing => _player.playing;
}
```

---

## lib/providers/auth_provider.dart

```dart
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/auth_service.dart';

final authServiceProvider = Provider<AuthService>((ref) => AuthService());

final authStateProvider = StreamProvider<User?>((ref) {
  return ref.watch(authServiceProvider).authStateChanges;
});
```

---

## lib/providers/player_provider.dart

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:audio_service/audio_service.dart';
import '../models/song.dart';
import '../services/api_service.dart';
import '../services/audio_handler.dart';

final audioHandlerProvider = Provider<YoufyAudioHandler>((ref) {
  throw UnimplementedError('Must be initialized in main()');
});

final currentSongProvider = StateProvider<Song?>((ref) => null);
final isPlayingProvider   = StateProvider<bool>((ref) => false);

class PlayerNotifier extends StateNotifier<AsyncValue<void>> {
  PlayerNotifier(this._api, this._handler) : super(const AsyncValue.data(null));

  final ApiService _api;
  final YoufyAudioHandler _handler;

  Future<void> playSong(Song song, WidgetRef ref) async {
    state = const AsyncValue.loading();
    try {
      // ALWAYS fetch stream URL fresh — never use cached URL
      final url = await _api.getStreamUrl(song.videoId);

      final item = MediaItem(
        id:       song.videoId,
        title:    song.title,
        artist:   song.artist,
        artUri:   song.thumbnail != null ? Uri.parse(song.thumbnail!) : null,
        duration: song.duration != null
            ? Duration(seconds: song.duration!)
            : null,
      );

      await _handler.playFromUrl(url, item);
      ref.read(currentSongProvider.notifier).state = song;
      ref.read(isPlayingProvider.notifier).state   = true;
      state = const AsyncValue.data(null);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }
}

final playerProvider =
    StateNotifierProvider<PlayerNotifier, AsyncValue<void>>((ref) {
  final api     = ref.watch(apiServiceProvider);
  final handler = ref.watch(audioHandlerProvider);
  return PlayerNotifier(api, handler);
});

final apiServiceProvider = Provider<ApiService>((ref) => ApiService());
```

---

## lib/providers/search_provider.dart

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/song.dart';
import '../services/api_service.dart';
import 'player_provider.dart';

final searchQueryProvider  = StateProvider<String>((ref) => '');
final searchResultsProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, query) async {
    if (query.isEmpty) return {'songs': [], 'albums': [], 'artists': []};
    final api = ref.watch(apiServiceProvider);
    return api.search(query);
  },
);
```

---

## lib/providers/lyrics_provider.dart

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/song.dart';
import '../services/api_service.dart';
import 'player_provider.dart';

final lyricsProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final song = ref.watch(currentSongProvider);
  if (song == null) return {'synced': [], 'plain': ''};
  final api = ref.watch(apiServiceProvider);
  return api.getLyrics(song.title, song.artist);
});
```

---

## lib/providers/playlist_provider.dart

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/playlist.dart';
import '../models/song.dart';
import '../services/api_service.dart';
import 'player_provider.dart';

final playlistsProvider = FutureProvider<List<Playlist>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  return api.getPlaylists();
});
```

---

## lib/screens/auth/login_screen.dart

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl  = TextEditingController();
  bool _loading    = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authServiceProvider).signIn(
        _emailCtrl.text.trim(), _passCtrl.text.trim());
      if (mounted) context.go('/home');
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Youfy', style: TextStyle(fontSize: 36, fontWeight: FontWeight.bold)),
            const SizedBox(height: 40),
            TextField(controller: _emailCtrl,  decoration: const InputDecoration(labelText: 'Email')),
            const SizedBox(height: 16),
            TextField(controller: _passCtrl,   decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _login,
                child: _loading ? const CircularProgressIndicator() : const Text('Login'),
              ),
            ),
            TextButton(
              onPressed: () => context.go('/register'),
              child: const Text('No account? Register'),
            ),
          ],
        ),
      ),
    );
  }
}
```

---

## lib/screens/player/player_screen.dart

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/player_provider.dart';
import '../../providers/lyrics_provider.dart';
import 'widgets/lyrics_view.dart';
import 'widgets/player_controls.dart';
import 'widgets/progress_bar.dart';

class PlayerScreen extends ConsumerWidget {
  const PlayerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final song = ref.watch(currentSongProvider);
    if (song == null) return const Scaffold(body: Center(child: Text('No song playing')));

    return Scaffold(
      appBar: AppBar(backgroundColor: Colors.transparent, elevation: 0),
      body: Column(
        children: [
          // Album art
          Padding(
            padding: const EdgeInsets.all(32),
            child: AspectRatio(
              aspectRatio: 1,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: song.thumbnail != null
                    ? Image.network(song.thumbnail!, fit: BoxFit.cover)
                    : Container(color: Colors.grey.shade800),
              ),
            ),
          ),
          Text(song.title,  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          Text(song.artist, style: TextStyle(color: Colors.grey.shade400)),
          const SizedBox(height: 16),
          const YoufyProgressBar(),
          const PlayerControls(),
          const Expanded(child: LyricsView()),
        ],
      ),
    );
  }
}
```

---

## lib/screens/player/widgets/lyrics_view.dart

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../providers/lyrics_provider.dart';
import '../../../providers/player_provider.dart';
import '../../../services/audio_handler.dart';

class LyricsView extends ConsumerWidget {
  const LyricsView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lyricsAsync = ref.watch(lyricsProvider);
    final handler     = ref.watch(audioHandlerProvider);

    return lyricsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error:   (e, _) => const Center(child: Text('Lyrics unavailable')),
      data: (data) {
        final synced = data['synced'] as List<dynamic>;
        if (synced.isEmpty) {
          return Center(
            child: Text(
              data['plain'] as String? ?? 'No lyrics found',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade400),
            ),
          );
        }

        return StreamBuilder<Duration>(
          stream: handler.positionStream,
          builder: (context, snapshot) {
            final pos = snapshot.data?.inMilliseconds ?? 0;
            // Find active lyric line
            int activeIndex = 0;
            for (int i = 0; i < synced.length; i++) {
              final lineMs = ((synced[i]['time'] as double) * 1000).toInt();
              if (pos >= lineMs) activeIndex = i;
            }

            return ListView.builder(
              itemCount: synced.length,
              itemBuilder: (context, i) {
                final isActive = i == activeIndex;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 16),
                  child: Text(
                    synced[i]['text'] as String,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize:   isActive ? 18 : 14,
                      fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                      color:      isActive ? Colors.white : Colors.grey.shade500,
                    ),
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}
```

---

## Stream URL Caching Rule (Critical)

```dart
// ❌ WRONG — stream URLs expire in ~6 hours
await Hive.box('cache').put('streamUrl_$videoId', url);

// ✅ CORRECT — only cache metadata
await Hive.box('cache').put('songMeta_$videoId', song.toJson());
// Always call GET /stream/:videoId fresh before every play
```

---

## Folder Structure Summary

```
lib/
├── main.dart
├── firebase_options.dart          (auto-generated by FlutterFire CLI)
├── core/
│   ├── constants/api_constants.dart
│   ├── router/app_router.dart
│   └── utils/duration_formatter.dart
├── models/
│   ├── song.dart
│   ├── album.dart
│   ├── artist.dart
│   └── playlist.dart
├── services/
│   ├── api_service.dart
│   ├── auth_service.dart
│   ├── audio_handler.dart
│   └── storage_service.dart
├── providers/
│   ├── auth_provider.dart
│   ├── player_provider.dart
│   ├── search_provider.dart
│   ├── playlist_provider.dart
│   └── lyrics_provider.dart
└── screens/
    ├── splash/splash_screen.dart
    ├── auth/login_screen.dart
    ├── auth/register_screen.dart
    ├── home/home_screen.dart
    ├── search/search_screen.dart
    ├── player/player_screen.dart
    ├── player/mini_player.dart
    ├── player/widgets/lyrics_view.dart
    ├── player/widgets/progress_bar.dart
    ├── player/widgets/player_controls.dart
    ├── library/library_screen.dart
    └── profile/profile_screen.dart
```
