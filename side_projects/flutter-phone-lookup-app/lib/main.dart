import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Phone Lookup',
      theme: ThemeData.dark(),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final TextEditingController controller = TextEditingController();
  String result = "";

  String normalize(String input) {
    return input.replaceAll(RegExp(r'[^0-9]'), '');
  }

  Future<void> search() async {
    final input = controller.text;
    final normalized = normalize(input);

    final snapshot = await FirebaseFirestore.instance
        .collection('phone_numbers')
        .where('normalizedNumber', isEqualTo: normalized)
        .limit(1)
        .get();

    if (snapshot.docs.isNotEmpty) {
      final data = snapshot.docs.first.data();
      setState(() {
        result = data['tag'] ?? "unknown";
      });
    } else {
      setState(() {
        result = "unknown";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Phone Lookup")),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                labelText: "Phone Number",
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: search,
              child: const Text("Search"),
            ),
            const SizedBox(height: 40),
            Text(
              result,
              style: const TextStyle(fontSize: 28),
            ),
          ],
        ),
      ),
    );
  }
}
