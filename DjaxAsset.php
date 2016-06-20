<?php
/**
 * Created by PhpStorm.
 * User: mikel
 * Date: 11/7/15
 * Time: 11:39 PM
 */

namespace anmishael\djax;

use yii\web\AssetBundle;

class DjaxAsset extends AssetBundle {
	public $sourcePath = '@vendor/anmishael/yii2-djax/assets';
    public $js = ['jquery.djax.js'];
    public $depends=[
        'yii\web\YiiAsset'
    ];
}