import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'screens/report_screen.dart';
import 'screens/search_screen.dart';
import 'services/firestore_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  String? startupError;
  try {
    await Firebase.initializeApp();
  } catch (e) {
    startupError = 'Firebase init failed. Add Firebase platform config files.';
  }

  runApp(PhoneLookupApp(startupError: startupError));
}

class PhoneLookupApp extends StatelessWidget {
  const PhoneLookupApp({super.key, this.startupError});

  final String? startupError;

  @override
  Widget build(BuildContext context) {
    final service = FirestoreService();

    return MaterialApp(
      title: 'Phone Lookup',
      theme: ThemeData(colorSchemeSeed: Colors.indigo, useMaterial3: true),
      home: DefaultTabController(
        length: 2,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Phone Lookup'),
            bottom: const TabBar(
              tabs: [
                Tab(text: 'Search phone'),
                Tab(text: 'Report phone'),
              ],
            ),
          ),
          body: Column(
            children: [
              if (startupError != null)
                Container(
                  width: double.infinity,
                  color: Colors.amber.shade100,
                  padding: const EdgeInsets.all(10),
                  child: Text(
                    startupError!,
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
              Expanded(
                child: TabBarView(
                  children: [
                    SearchScreen(service: service),
                    ReportScreen(service: service),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
