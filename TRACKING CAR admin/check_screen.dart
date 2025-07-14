import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:camera/camera.dart';
import 'package:path_provider/path_provider.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:uuid/uuid.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter/foundation.dart';



class CheckScreen extends StatefulWidget {
  const CheckScreen({Key? key}) : super(key: key);

  @override
  _CheckScreenState createState() => _CheckScreenState();
}

class _CheckScreenState extends State<CheckScreen> with SingleTickerProviderStateMixin {
  // Contrôleurs pour stocker les valeurs
  final List<TextEditingController> _chassisControllers = List.generate(17, (_) => TextEditingController());
  final List<TextEditingController> _plateControllers = List.generate(7, (_) => TextEditingController());
  final List<FocusNode> _chassisFocusNodes = List.generate(17, (_) => FocusNode());
  final List<FocusNode> _plateFocusNodes = List.generate(7, (_) => FocusNode());

  bool _isLoading = false;
  bool _hasError = false;
  String _errorMessage = '';
  bool _isChassisSelected = true; // Toggle entre châssis et plaque
  bool _isProcessing = false; // Empêche les changements pendant le traitement
  bool _isAuthenticating = false; // Spécifiquement pour le processus d'authentification

  // Infos utilisateur
  String? _userEmail;
  String? _userName;
  String? _userId;
  bool _isUserInfoLoaded = false;

  // Résultat de la vérification
  Map<String, dynamic>? _result;

  // Animation
  late AnimationController _animController;
  late Animation<double> _animation;

  // Camera
  CameraController? _cameraController;
  bool _isTakingSelfie = false;

  // Firebase Auth
  final FirebaseAuth _auth = FirebaseAuth.instance;

  // Sign-in clients - Configuration spécifique pour éviter les problèmes de type
  late final GoogleSignIn _googleSignIn;

  Future<void> _initializeGoogleSignIn() async {
    await Future.delayed(const Duration(milliseconds: 100));
    _googleSignIn = GoogleSignIn(scopes: ['email']);
  }

  // Écouteur d'authentification
  StreamSubscription<User?>? _authStateSubscription;

  @override
  void initState() {
    super.initState();

    // Initialiser GoogleSignIn avec un délai
    _initializeGoogleSignIn();

    // Configuration des animations
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );

    _animation = CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOutQuint,
    );

    // Configuration des contrôleurs de texte et nœuds de focus
    _setupTextControllers();

    // Configurer l'écouteur d'authentification
    _setupAuthListener();

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      // Attendre pour s'assurer que le widget est correctement initialisé
      await Future.delayed(Duration(milliseconds: 500));

      // Demander les permissions
      await _requestPermissions();

      // Ne pas appeler _checkCurrentUser ici, car l'écouteur s'en chargera
    });
  }

  void _setupAuthListener() {
    // S'abonner aux changements d'état d'authentification
    _authStateSubscription = _auth.authStateChanges().listen((User? user) async {
      print("État d'authentification modifié: ${user?.email ?? 'aucun utilisateur'}");

      if (user != null && user.email != null) {
        // Utilisateur connecté
        if (!mounted) return;

        setState(() {
          _userEmail = user.email;
          _userName = user.displayName ?? user.email!.split('@')[0];
          _userId = user.uid;
          _isUserInfoLoaded = true;
          _isAuthenticating = false;
        });

        try {
          // Sauvegarder en local
          SharedPreferences prefs = await SharedPreferences.getInstance();
          await prefs.setString('account_email', user.email!);
          await prefs.setString('account_name', _userName!);
          await prefs.setString('account_id', user.uid);

          // Envelopper cette partie dans un try-catch spécifique pour ignorer les erreurs
          try {
            Map<String, dynamic> deviceInfo = {};

            // Récupération basique des infos sans utiliser de méthodes qui pourraient générer l'erreur
            if (Platform.isAndroid) {
              deviceInfo = {
                'platform': 'android',
                'os_version': Platform.operatingSystemVersion,
              };
            } else if (Platform.isIOS) {
              deviceInfo = {
                'platform': 'ios',
                'os_version': Platform.operatingSystemVersion,
              };
            }

            // Mettre à jour Firestore
            await FirebaseFirestore.instance
                .collection('users')
                .doc(user.uid)
                .set({
              'email': user.email,
              'displayName': user.displayName,
              'photoURL': user.photoURL,
              'lastLoginAt': FieldValue.serverTimestamp(),
              'deviceInfo': deviceInfo,
              'lastActive': FieldValue.serverTimestamp(),
            }, SetOptions(merge: true));
          } catch (e) {
            print("Erreur lors de la mise à jour Firestore: $e");
          }

          print("Information utilisateur mise à jour suite au changement d'état d'authentification");
        } catch (e) {
          // print("Erreur lors de la mise à jour des informations utilisateur: $e");
        }
      } else {
        // Pas d'utilisateur connecté, vérifier dans les préférences locales
        _loadAndValidateLocalUserInfo();
      }
    });
  }

  Future<void> _loadAndValidateLocalUserInfo() async {
    if (!mounted) return;

    try {
      SharedPreferences prefs = await SharedPreferences.getInstance();
      String? email = prefs.getString('account_email');
      String? name = prefs.getString('account_name');
      String? id = prefs.getString('account_id');

      if (email != null && email.isNotEmpty &&
          name != null && name.isNotEmpty &&
          id != null && id.isNotEmpty) {

        print("Informations utilisateur trouvées localement: $email");

        try {
          // Vérifier si l'utilisateur existe toujours dans Firestore
          DocumentSnapshot userDoc = await FirebaseFirestore.instance
              .collection('users')
              .doc(id)
              .get();

          if (!mounted) return;

          if (userDoc.exists) {
            print("Utilisateur validé dans Firestore");

            // Mettre à jour le statut dans Firestore
            await FirebaseFirestore.instance
                .collection('users')
                .doc(id)
                .update({'lastActive': FieldValue.serverTimestamp()});

            setState(() {
              _userEmail = email;
              _userName = name;
              _userId = id;
              _isUserInfoLoaded = true;
            });
          } else {
            print("Utilisateur non trouvé dans Firestore - informations locales obsolètes");

            // Nettoyer les préférences
            await prefs.remove('account_email');
            await prefs.remove('account_name');
            await prefs.remove('account_id');

            if (mounted) {
              setState(() {
                _isUserInfoLoaded = false;
                _userEmail = null;
                _userName = null;
                _userId = null;
              });

              // Montrer la boîte de dialogue de connexion
              _showAccountPermissionDialog();
            }
          }
        } catch (e) {
          print("Erreur lors de la vérification Firestore: $e");

          // En cas d'erreur, considérons les informations valides pour le moment
          if (!mounted) return;
          setState(() {
            _userEmail = email;
            _userName = name;
            _userId = id;
            _isUserInfoLoaded = true;
          });
        }
      } else {
        print("Aucune information utilisateur valide trouvée localement");
        if (mounted && !_isAuthenticating) {
          _showAccountPermissionDialog();
        }
      }
    } catch (e) {
      print("Erreur lors de la récupération des préférences: $e");
      if (mounted && !_isAuthenticating) {
        _showAccountPermissionDialog();
      }
    }
  }

  void _setupTextControllers() {
    // Setup des écouteurs pour le numéro de châssis
    for (int i = 0; i < 17; i++) {
      final controller = _chassisControllers[i];
      final focusNode = _chassisFocusNodes[i];

      controller.addListener(() {
        if (controller.text.isNotEmpty && i < 16 && controller.selection.baseOffset == 1) {
          FocusScope.of(context).requestFocus(_chassisFocusNodes[i + 1]);
        }
      });

      focusNode.addListener(() {
        if (focusNode.hasFocus) {
          RawKeyboard.instance.addListener(_handleKeyEvent);
        } else {
          RawKeyboard.instance.removeListener(_handleKeyEvent);
        }
      });
    }

    // Setup des écouteurs pour la plaque
    for (int i = 0; i < 7; i++) {
      final controller = _plateControllers[i];
      final focusNode = _plateFocusNodes[i];

      controller.addListener(() {
        if (controller.text.isNotEmpty && i < 6 && controller.selection.baseOffset == 1) {
          FocusScope.of(context).requestFocus(_plateFocusNodes[i + 1]);
        }
      });

      focusNode.addListener(() {
        if (focusNode.hasFocus) {
          RawKeyboard.instance.addListener(_handleKeyEvent);
        } else {
          RawKeyboard.instance.removeListener(_handleKeyEvent);
        }
      });
    }
  }

  void _handleKeyEvent(RawKeyEvent event) {
    if (event is RawKeyDownEvent &&
        event.logicalKey == LogicalKeyboardKey.backspace) {

      final controllers = _isChassisSelected ? _chassisControllers : _plateControllers;
      final focusNodes = _isChassisSelected ? _chassisFocusNodes : _plateFocusNodes;

      int currentFocusIndex = -1;
      for (int i = 0; i < focusNodes.length; i++) {
        if (focusNodes[i].hasFocus) {
          currentFocusIndex = i;
          break;
        }
      }

      if (currentFocusIndex != -1) {
        if (controllers[currentFocusIndex].text.isEmpty && currentFocusIndex > 0) {
          controllers[currentFocusIndex - 1].clear();
          FocusScope.of(context).requestFocus(focusNodes[currentFocusIndex - 1]);
        }
      }
    }
  }

  @override
  void dispose() {
    // Annuler l'abonnement à l'écouteur d'authentification
    _authStateSubscription?.cancel();

    for (var controller in _chassisControllers) {
      controller.dispose();
    }
    for (var controller in _plateControllers) {
      controller.dispose();
    }
    for (var node in _chassisFocusNodes) {
      node.dispose();
    }
    for (var node in _plateFocusNodes) {
      node.dispose();
    }

    _animController.dispose();
    _cameraController?.dispose();
    RawKeyboard.instance.removeListener(_handleKeyEvent);
    super.dispose();
  }

  Future<void> _showAccountPermissionDialog() async {
    if (!mounted || _isAuthenticating) return;

    return showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          title: Text('Accès au compte'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.account_circle,
                size: 60,
                color: Color(0xFF1A237E),
              ),
              SizedBox(height: 16),
              Text(
                'Pour vous récompenser en cas de détection d\'un véhicule volé, l\'application a besoin d\'accéder à votre compte Google.',
                style: TextStyle(fontSize: 14),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('La connexion est requise pour utiliser l\'application'),
                    backgroundColor: Colors.orange,
                  ),
                );
              },
              child: Text('Plus tard'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.of(context).pop();
                _signInWithGoogle();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Color(0xFF1A237E),
              ),
              child: Text('Se connecter'),
            ),
          ],
        );
      },
    );
  }

  // Méthode d'authentification révisée
  Future<void> _signInWithGoogle() async {
    if (!mounted || _isLoading || _isAuthenticating) return;

    setState(() {
      _isLoading = true;
      _isAuthenticating = true;
      _hasError = false;
      _errorMessage = '';
    });

    try {
      print("Début de l'authentification Google...");

      // 1. Déconnecter toute session existante
      try {
        await _googleSignIn.signOut();
        await Future.delayed(Duration(milliseconds: 300));
        await _auth.signOut();
        await Future.delayed(Duration(milliseconds: 300));
      } catch (e) {
        print("Erreur lors de la déconnexion préalable: $e");
        // On continue quand même
      }

      // 2. SignIn avec Google - cette étape ouvre le sélecteur de compte
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      // .catchError((e) => throw Exception("Erreur lors de la sélection du compte: $e"));

      if (googleUser == null) {
        throw Exception("Sélection de compte annulée");
      }

      print("Compte Google sélectionné: ${googleUser.email}");

      // 3. Obtenir les informations d'authentification
      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
      // .catchError((e) => throw Exception("Erreur lors de l'authentification Google: $e"));

      if (googleAuth.accessToken == null || googleAuth.idToken == null) {
        throw Exception("Impossible d'obtenir les tokens d'authentification");
      }

      // 4. Créer les credentials Firebase
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      // 5. S'authentifier avec Firebase
      print("Authentification Firebase en cours...");

      // Cette étape va déclencher notre écouteur authStateChanges
      final UserCredential userCredential = await _auth.signInWithCredential(credential);
      // .catchError((e) => throw Exception("Erreur lors de l'authentification Firebase: $e"));

      final User? user = userCredential.user;

      if (user == null) {
        throw Exception("Authentification échouée: aucun utilisateur retourné");
      }

      print("Authentification Firebase réussie: ${user.email}");

      // On n'a pas besoin de mettre à jour les variables ici
      // L'écouteur authStateChanges va s'en charger automatiquement

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Connecté avec succès'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      //  print("Erreur d'authentification: $e");

      // if (!mounted) return;
      // setState(() {
      //   _hasError = true;
      //   _isAuthenticating = false;
      //  // _errorMessage = e.toString();
      // });

      // Afficher le message d'erreur
      // ScaffoldMessenger.of(context).showSnackBar(
      //   // SnackBar(
      //   // //  content: Text('Erreur de connexion: ${e.toString()}'),
      //   //   backgroundColor: Colors.red,
      //   //   duration: Duration(seconds: 5),
      //   // ),
      // );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          // Ne pas réinitialiser _isAuthenticating ici
          // Il sera réinitialisé quand l'écouteur authStateChanges détectera l'utilisateur
        });
      }
    }
  }

  Future<void> _requestPermissions() async {
    try {
      await Permission.camera.request();
      await Permission.location.request();
    } catch (e) {
      print("Erreur lors de la demande de permissions: $e");
    }
  }

  // Méthode simplifiée pour obtenir les infos de l'appareil sans utiliser de plugins qui causent des erreurs
  Future<Map<String, dynamic>> _getSimpleDeviceInfo() async {
    Map<String, dynamic> deviceData = {
      'platform': Platform.operatingSystem,
      'os_version': Platform.operatingSystemVersion,
    };

    return deviceData;
  }

  Future<void> _takeSelfie() async {
    if (_userEmail == null || _userName == null || !mounted) {
      print("Impossible de prendre un selfie: informations utilisateur manquantes ou widget démonté");
      return;
    }

    try {
      setState(() {
        _isTakingSelfie = true;
      });

      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        print("Aucune caméra disponible");
        return;
      }

      final frontCamera = cameras.firstWhere(
            (camera) => camera.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );

      _cameraController = CameraController(
        frontCamera,
        ResolutionPreset.medium,
        enableAudio: false,
      );

      await _cameraController!.initialize();
      await Future.delayed(Duration(milliseconds: 500));

      if (_cameraController!.value.isInitialized) {
        final XFile photo = await _cameraController!.takePicture();
        await _uploadSelfie(photo.path);

        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Vérification enregistrée avec succès!'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      print('Erreur lors de la prise de selfie: $e');
    } finally {
      await _cameraController?.dispose();
      _cameraController = null;
      if (!mounted) return;
      setState(() {
        _isTakingSelfie = false;
      });
    }
  }

  Future<void> _uploadSelfie(String filePath) async {
    try {
      final deviceInfo = await _getSimpleDeviceInfo();

      Position? position;
      try {
        position = await Geolocator.getCurrentPosition();
      } catch (e) {
        print('Erreur position: $e');
      }

      final String selfieId = Uuid().v4();
      final storageRef = FirebaseStorage.instance.ref().child('selfies/$selfieId.jpg');

      await storageRef.putFile(File(filePath));
      final downloadUrl = await storageRef.getDownloadURL();

      await FirebaseFirestore.instance.collection('detections').add({
        'user_email': _userEmail,
        'user_name': _userName,
        'user_id': _userId,
        'selfie_url': downloadUrl,
        'selfie_id': selfieId,
        'chassis_number': _isChassisSelected ? _getChassisNumber() : null,
        'plate_number': !_isChassisSelected ? _getPlateNumber() : null,
        'timestamp': FieldValue.serverTimestamp(),
        'device_info': deviceInfo,
        'location': position != null ? {
          'latitude': position.latitude,
          'longitude': position.longitude,
        } : null,
        'result_data': _result,
      });

      print('Selfie téléchargé avec succès: $downloadUrl');
    } catch (e) {
      print('Erreur upload: $e');
    }
  }

  String _getChassisNumber() {
    return _chassisControllers.map((controller) => controller.text).join('');
  }

  String _getPlateNumber() {
    return _plateControllers.map((controller) => controller.text).join('');
  }

  String _formatFirestoreDate(dynamic dateValue) {
    if (dateValue == null) return '-';

    if (dateValue is Timestamp) {
      final dateTime = dateValue.toDate();
      return '${dateTime.day.toString().padLeft(2, '0')}/${dateTime.month.toString().padLeft(2, '0')}/${dateTime.year}';
    } else if (dateValue is String) {
      return dateValue;
    } else {
      return '-';
    }
  }

  Future<void> _verifyVehicle() async {
    if (!_isUserInfoLoaded) {
      await _showAccountPermissionDialog();
      if (!_isUserInfoLoaded) return;
    }

    if (_isProcessing || !mounted) return;

    FocusScope.of(context).unfocus();

    if (_isChassisSelected) {
      final chassisNumber = _getChassisNumber();
      if (chassisNumber.length < 17) {
        setState(() {
          _hasError = true;
          _errorMessage = "Veuillez compléter le numéro de châssis (17 caractères)";
        });
        return;
      }
    } else {
      final plateNumber = _getPlateNumber();
      if (plateNumber.length < 7) {
        setState(() {
          _hasError = true;
          _errorMessage = "Veuillez compléter la plaque d'immatriculation (7 caractères)";
        });
        return;
      }
    }

    setState(() {
      _isLoading = true;
      _isProcessing = true;
      _hasError = false;
      _errorMessage = '';
      _result = null;
    });

    try {
      Position? position;
      try {
        position = await Geolocator.getCurrentPosition();
      } catch (e) {
        print('Erreur position: $e');
      }

      Query query = FirebaseFirestore.instance.collection('stolen_vehicles')
          .where('status', isEqualTo: 'active');

      if (_isChassisSelected) {
        query = query.where('chassis_number', isEqualTo: _getChassisNumber());
      } else {
        query = query.where('license_plate', isEqualTo: _getPlateNumber());
      }

      final snapshot = await query.get();
      bool isStolen = snapshot.docs.isNotEmpty;
      Map<String, dynamic>? vehicleDetails;

      if (isStolen) {
        final docData = snapshot.docs.first.data() as Map<String, dynamic>;
        vehicleDetails = {
          'make': docData['make'] ?? '',
          'model': docData['model'] ?? '',
          'year': docData['year']?.toString() ?? '',
          'color': docData['color'] ?? '',
          'license_plate': docData['license_plate'] ?? '',
          'theft_date': docData['theft_date'],
          'theft_location': docData['theft_location'] ?? '',
          'case_number': docData['case_number'] ?? '',
          'legion': docData['legion'] ?? '',
          'status': docData['status'] ?? '',
          'owner': docData['owner'] ?? '',
          'phone': docData['phone'] ?? '',
          'chassis_number': docData['chassis_number'] ?? '',
        };
      }

      DocumentReference checkRef = await FirebaseFirestore.instance
          .collection('vehicle_checks').add({
        'chassis_number': _isChassisSelected ? _getChassisNumber() : null,
        'license_plate': !_isChassisSelected ? _getPlateNumber() : null,
        'check_date': FieldValue.serverTimestamp(),
        'result': isStolen ? 'stolen' : 'clean',
        'user_email': _userEmail,
        'user_name': _userName,
        'user_id': _userId,
        'latitude': position?.latitude,
        'longitude': position?.longitude,
      });

      Map<String, dynamic> resultMap = {
        'id': checkRef.id,
        'chassisNumber': _isChassisSelected ? _getChassisNumber() : null,
        'licensePlate': !_isChassisSelected ? _getPlateNumber() : null,
        'checkDate': DateTime.now().toString(),
        'result': isStolen ? 'stolen' : 'clean',
        'requiresSelfie': isStolen,
      };

      if (isStolen && vehicleDetails != null) {
        resultMap['vehicleDetails'] = vehicleDetails;
      }

      if (!mounted) return;
      setState(() {
        _result = resultMap;
        _isLoading = false;
      });

      _animController.forward();

      if (isStolen) {
        await _takeSelfie();
      }
    } catch (e) {
      print('Erreur de vérification: $e');
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _hasError = true;
        _errorMessage = 'Erreur: $e';
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _isProcessing = false;
      });
    }
  }

  void _resetForm() {
    if (!mounted) return;

    setState(() {
      for (var controller in _chassisControllers) {
        controller.clear();
      }
      for (var controller in _plateControllers) {
        controller.clear();
      }
      _result = null;
      _hasError = false;
      _errorMessage = '';
    });

    _animController.reset();

    if (_isChassisSelected) {
      FocusScope.of(context).requestFocus(_chassisFocusNodes[0]);
    } else {
      FocusScope.of(context).requestFocus(_plateFocusNodes[0]);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Color(0xFFF6F8FA),
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // En-tête avec gradient
              Container(
                height: 160,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF1A237E), Color(0xFF3949AB)],
                  ),
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(30),
                    bottomRight: Radius.circular(30),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.2),
                      blurRadius: 10,
                      offset: Offset(0, 5),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Logo avec ombre
                    Container(
                      height: 60,
                      width: 60,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.2),
                            blurRadius: 10,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: Icon(
                        Icons.security,
                        size: 35,
                        color: Color(0xFF1A237E),
                      ),
                    ),
                    SizedBox(height: 12),
                    Text(
                      'TRACKING CAR',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        letterSpacing: 1,
                        shadows: [
                          Shadow(
                            blurRadius: 5.0,
                            color: Colors.black.withOpacity(0.3),
                            offset: Offset(0, 2),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Vérification de Véhicules',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.white.withOpacity(0.9),
                      ),
                    ),
                  ],
                ),
              ),

              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    // Sélection du type de vérification
                    Container(
                      margin: EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 10,
                            spreadRadius: 0,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(
                                  Icons.info_outline_rounded,
                                  color: Color(0xFF1A237E),
                                  size: 18,
                                ),
                                SizedBox(width: 8),
                                Text(
                                  'Mode de Vérification',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF1A237E),
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(height: 14),
                            Row(
                              children: [
                                _buildSelectionButton(
                                  title: 'N° Châssis',
                                  icon: Icons.confirmation_number_outlined,
                                  isSelected: _isChassisSelected,
                                  onTap: () => setState(() {
                                    if (!_isProcessing) {
                                      _isChassisSelected = true;
                                      _hasError = false;
                                      _errorMessage = '';
                                    }
                                  }),
                                ),
                                SizedBox(width: 10),
                                _buildSelectionButton(
                                  title: 'Immatriculation',
                                  icon: Icons.drive_eta_outlined,
                                  isSelected: !_isChassisSelected,
                                  onTap: () => setState(() {
                                    if (!_isProcessing) {
                                      _isChassisSelected = false;
                                      _hasError = false;
                                      _errorMessage = '';
                                    }
                                  }),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Champ de saisie
                    Container(
                      margin: EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 10,
                            spreadRadius: 0,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _isChassisSelected ? 'Numéro de Châssis (VIN)' : 'Plaque d\'Immatriculation',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF1A237E),
                              ),
                            ),
                            SizedBox(height: 14),

                            // Champs de saisie caractère par caractère
                            if (_isChassisSelected)
                              _buildPinInputField(
                                controllers: _chassisControllers,
                                focusNodes: _chassisFocusNodes,
                                count: 17,
                              )
                            else
                              _buildPinInputField(
                                controllers: _plateControllers,
                                focusNodes: _plateFocusNodes,
                                count: 7,
                              ),

                            // Message d'erreur
                            if (_hasError) ...[
                              SizedBox(height: 12),
                              Container(
                                padding: EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                                decoration: BoxDecoration(
                                  color: Colors.red[50],
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: Colors.red[200]!),
                                ),
                                child: Row(
                                  children: [
                                    Icon(Icons.error_outline, color: Colors.red, size: 18),
                                    SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        _errorMessage,
                                        style: TextStyle(color: Colors.red[700], fontSize: 14),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],

                            SizedBox(height: 18),

                            // Affichage des infos utilisateur
                            if (_isUserInfoLoaded && _userEmail != null && _userName != null) ...[
                              Container(
                                padding: EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: Colors.blue[50],
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: Colors.blue[200]!),
                                ),
                                child: Row(
                                  children: [
                                    Icon(Icons.account_circle, color: Colors.blue[700], size: 18),
                                    SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        'Connecté en tant que: $_userName ($_userEmail)',
                                        style: TextStyle(color: Colors.blue[700], fontSize: 12),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              SizedBox(height: 18),
                            ],

                            // Bouton de connexion si non connecté
                            if (!_isUserInfoLoaded) ...[
                              SizedBox(
                                width: double.infinity,
                                height: 45,
                                child: ElevatedButton.icon(
                                  icon: Icon(Icons.login),
                                  label: Text('CONNEXION REQUISE'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.orange[600],
                                    foregroundColor: Colors.white,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                  onPressed: _signInWithGoogle,
                                ),
                              ),
                              SizedBox(height: 12),
                            ],

                            // Bouton de vérification
                            SizedBox(
                              width: double.infinity,
                              height: 50,
                              child: ElevatedButton(
                                onPressed: _isLoading || !_isUserInfoLoaded ? null : _verifyVehicle,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Color(0xFF1A237E),
                                  foregroundColor: Colors.white,
                                  elevation: 2,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  padding: EdgeInsets.symmetric(vertical: 12),
                                ),
                                child: _isLoading
                                    ? SizedBox(
                                  height: 24,
                                  width: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                                    : Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.search),
                                    SizedBox(width: 8),
                                    Text(
                                      'VÉRIFIER',
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 1,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),

                            // Bouton reset
                            if (_result != null)
                              Center(
                                child: TextButton.icon(
                                  onPressed: _resetForm,
                                  icon: Icon(Icons.refresh),
                                  label: Text('Nouvelle vérification'),
                                  style: TextButton.styleFrom(
                                    foregroundColor: Color(0xFF1A237E),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),

                    // Résultat
                    if (_result != null)
                      FadeTransition(
                        opacity: _animation,
                        child: SlideTransition(
                          position: Tween<Offset>(
                            begin: Offset(0, 0.2),
                            end: Offset.zero,
                          ).animate(_animation),
                          child: Container(
                            margin: EdgeInsets.only(bottom: 16),
                            decoration: BoxDecoration(
                              color: _result!['result'] == 'stolen' ? Color(0xFFFFEBEE) : Color(0xFFE8F5E9),
                              borderRadius: BorderRadius.circular(16),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.05),
                                  blurRadius: 10,
                                  spreadRadius: 0,
                                  offset: Offset(0, 4),
                                ),
                              ],
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Titre du résultat
                                  Row(
                                    children: [
                                      Container(
                                        width: 36,
                                        height: 36,
                                        decoration: BoxDecoration(
                                          color: _result!['result'] == 'stolen' ? Colors.red[400] : Colors.green[400],
                                          shape: BoxShape.circle,
                                        ),
                                        child: Icon(
                                          _result!['result'] == 'stolen' ? Icons.warning_rounded : Icons.check_circle,
                                          color: Colors.white,
                                          size: 22,
                                        ),
                                      ),
                                      SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          _result!['result'] == 'stolen' ? 'VÉHICULE VOLÉ DÉTECTÉ!' : 'VÉHICULE NON SIGNALÉ',
                                          style: TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.bold,
                                            color: _result!['result'] == 'stolen' ? Colors.red[700] : Colors.green[700],
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),

                                  SizedBox(height: 14),
                                  Divider(),
                                  SizedBox(height: 8),

                                  // Détails du véhicule
                                  if (_result!['result'] == 'stolen' && _result!.containsKey('vehicleDetails')) ...[
                                    _buildResultRow('Numéro de châssis', _result!['vehicleDetails']['chassis_number'] ?? _result!['chassisNumber'] ?? '-'),
                                    _buildResultRow('Immatriculation', _result!['vehicleDetails']['license_plate'] ?? '-'),
                                    _buildResultRow('Marque', _result!['vehicleDetails']['make'] ?? '-'),
                                    _buildResultRow('Modèle', _result!['vehicleDetails']['model'] ?? '-'),
                                    _buildResultRow('Année', _result!['vehicleDetails']['year']?.toString() ?? '-'),
                                    _buildResultRow('Couleur', _result!['vehicleDetails']['color'] ?? '-'),
                                    _buildResultRow('Légion', _result!['vehicleDetails']['legion'] ?? '-'),
                                    _buildResultRow('Statut', _result!['vehicleDetails']['status'] ?? '-'),
                                    _buildResultRow('Propriétaire', _result!['vehicleDetails']['owner'] ?? '-'),
                                    _buildResultRow('Téléphone', _result!['vehicleDetails']['phone'] ?? '-'),
                                    _buildResultRow('Date du vol', _formatFirestoreDate(_result!['vehicleDetails']['theft_date'])),
                                    _buildResultRow('Lieu du vol', _result!['vehicleDetails']['theft_location'] ?? '-'),
                                    _buildResultRow('N° de dossier', _result!['vehicleDetails']['case_number'] ?? '-'),

                                    SizedBox(height: 14),

                                    // Message d'alerte
                                    Container(
                                      width: double.infinity,
                                      padding: EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: Colors.red[100],
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Column(
                                        children: [
                                          Text(
                                            'Ce véhicule a été signalé comme volé. Veuillez contacter le commissariat le plus proche.',
                                            style: TextStyle(
                                              color: Colors.red[900],
                                              fontWeight: FontWeight.w500,
                                            ),
                                            textAlign: TextAlign.center,
                                          ),
                                          SizedBox(height: 8),
                                          if (_result!['requiresSelfie'] == true)
                                            Text(
                                              'La détection a été enregistrée pour une récompense.',
                                              style: TextStyle(
                                                color: Colors.red[900],
                                                fontStyle: FontStyle.italic,
                                              ),
                                              textAlign: TextAlign.center,
                                            ),
                                        ],
                                      ),
                                    ),
                                  ] else ...[
                                    _buildResultRow(
                                      _isChassisSelected ? 'Numéro de châssis' : 'Immatriculation',
                                      _isChassisSelected ? _result!['chassisNumber'] : _result!['licensePlate'],
                                    ),
                                    _buildResultRow('Date de vérification', _result!['checkDate']),

                                    SizedBox(height: 14),

                                    // Message de confirmation
                                    Container(
                                      width: double.infinity,
                                      padding: EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: Colors.green[100],
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        'Ce véhicule n\'est pas signalé comme volé dans notre base de données.',
                                        style: TextStyle(
                                          color: Colors.green[900],
                                          fontWeight: FontWeight.w500,
                                        ),
                                        textAlign: TextAlign.center,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),

                    SizedBox(height: 20),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSelectionButton({
    required String title,
    required IconData icon,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 46,
          decoration: BoxDecoration(
            color: isSelected ? Color(0xFF1A237E) : Colors.grey[200],
            borderRadius: BorderRadius.circular(12),
            boxShadow: isSelected
                ? [
              BoxShadow(
                color: Color(0xFF1A237E).withOpacity(0.3),
                blurRadius: 8,
                offset: Offset(0, 2),
              ),
            ]
                : [],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                color: isSelected ? Colors.white : Colors.grey[600],
                size: 18,
              ),
              SizedBox(width: 6),
              Text(
                title,
                style: TextStyle(
                  color: isSelected ? Colors.white : Colors.grey[600],
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPinInputField({
    required List<TextEditingController> controllers,
    required List<FocusNode> focusNodes,
    required int count,
  }) {
    double boxSize = count <= 7 ? 30 : 26;

    return Container(
      alignment: Alignment.center,
      child: Wrap(
        spacing: 5,
        runSpacing: 8,
        alignment: WrapAlignment.center,
        children: List.generate(
          count,
              (index) => Container(
            width: boxSize,
            height: boxSize + 10,
            decoration: BoxDecoration(
              color: Colors.grey[50],
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: Colors.grey[300]!),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.03),
                  blurRadius: 2,
                  spreadRadius: 0,
                  offset: Offset(0, 1),
                ),
              ],
            ),
            child: TextField(
              controller: controllers[index],
              focusNode: focusNodes[index],
              textAlign: TextAlign.center,
              maxLength: 1,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
              decoration: InputDecoration(
                counterText: "",
                border: InputBorder.none,
                contentPadding: EdgeInsets.zero,
              ),
              keyboardType: TextInputType.text,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [
                UpperCaseTextFormatter(),
                FilteringTextInputFormatter.allow(RegExp(r'[0-9A-Za-z]')),
              ],
              onChanged: (value) {
                if (value.length == 1 && index < controllers.length - 1) {
                  FocusScope.of(context).requestFocus(focusNodes[index + 1]);
                }
                else if (value.isEmpty && index > 0) {
                  FocusScope.of(context).requestFocus(focusNodes[index - 1]);
                }
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildResultRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              '$label:',
              style: TextStyle(
                fontWeight: FontWeight.w500,
                color: Colors.grey[700],
                fontSize: 13,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: Colors.black87,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// Formatter pour convertir en majuscule
class UpperCaseTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    return TextEditingValue(
      text: newValue.text.toUpperCase(),
      selection: newValue.selection,
    );
  }
}